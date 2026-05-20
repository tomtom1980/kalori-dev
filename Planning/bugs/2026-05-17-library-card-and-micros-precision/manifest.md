# bugfix-tomi batch 2026-05-17-library-card-and-micros-precision — Manifest

**Batch label:** 2026-05-17-library-card-and-micros-precision
**Date:** 2026-05-17
**Trigger:** Two user-reported library defects — (1) library card "Nx logged" badge stuck at 0 after first save-to-library, (2) micronutrient amount renders "0 mg" alongside a non-zero %RDA badge.
**Starting SHA:** `ffb1bef`
**Final SHA (HEAD):** _set by Phase 8 commit step_

---

## Bugs in scope (2)

### Bug 1 — Library card log_count badge stays at 0 after first save-to-library (Critical user-facing)

**Title:** Save-to-library INSERT omitted `log_count` / `last_used_at`, leaving the badge at the DB-default 0 even though the same handler had just committed a `food_entries` row for the library item.
**Source file:** `app/api/entries/save/route.ts`
**Tests file:** `tests/unit/api/entries-save.test.ts`
**Classification:** known_fix → data-integrity (R1 reclassified once Codex surfaced the invariant break)
**TDD required:** yes
**UI-touching:** false (server-side route handler; the badge re-renders from the row's `log_count` column via RSC)
**Risk:** low → medium after R1 (data-integrity invariant) → managed by R3 gate
**Final commit:** _set by Phase 8_

**Root cause (initial framing):** `app/api/entries/save/route.ts` save-to-library branch (lines 569-584 of the original file) INSERTed a `food_library_items` row without explicitly setting `log_count` or `last_used_at`. DB defaults (`log_count int not null default 0`, `last_used_at` nullable / null) left the row in a "never logged" state even though the same request had just committed the corresponding `food_entries` row at lines ~260-330. The re-log path (lines 421-509) and `/api/library/[id]/log-now` both correctly derived `log_count` from `COUNT(food_entries)` AFTER insert; only the first-save path was broken.

**Initial fix:** Hard-coded `log_count: 1` + `last_used_at: new Date().toISOString()` on the INSERT payload. Rationale: brand-new row, no prior entries to count, no round-trip cost. (Initial implementation output at `outputs/bug-1.md`.)

**Codex R1 expansion (Critical + Improvement):**
- **C1 (Critical) — initial hard-coded `1` conflicts with the COUNT(*)-based re-log derivation.** The `food_entries` row inserted earlier in the same request still carried `library_item_id: body.library_item_id ?? null`, so it could not point at the freshly-created library row. The first later re-log would COUNT only that re-log entry and write `log_count = 1` (instead of 2), permanently off-by-one.
- **I1 (Improvement) — concurrent duplicate first-saves silently drop the loser's count update.** Partial unique index on active `(user_id, normalized_name)` already prevented duplicate rows; the losing handler's `food_library_items` INSERT raised 23505 and the route swallowed it, leaving the losing tab's entry orphaned and the badge under-counted.

**R1 auto-fix (single sub-agent):** Unified 4-step flow replacing the hard-coded `1`:
1. INSERT `food_library_items` without `log_count` / `last_used_at` (DB defaults; bump will own authoritative value).
2. 23505 recovery — on conflict, SELECT existing active row by `(user_id, normalized_name, deleted_at IS NULL)`.
3. Link UPDATE — set `food_entries.library_item_id` to the recovered/new id with RLS-defense `(id, user_id)` scope.
4. COUNT-derived bump — `COUNT(food_entries WHERE library_item_id = id)` → `UPDATE food_library_items SET log_count, last_used_at = now()`. `Math.max(1, count ?? 1)` floor matches the re-log + log-now pattern. Cache invalidation moved INTO this branch (was previously on libRow-success).

Sketch enqueue stays on libRow-success path (skipped for 23505 recovery — winning tab already enqueued; sketch idempotency would short-circuit anyway). All four error paths Sentry-captured with distinct `scope` tags.

**Codex R2 retry (after concurrent-session stash recovery — see Recovery incidents below):**
- **C1-R2 (Critical) — link failure still publishes a successful library bump.** If the link UPDATE errors, matches 0 rows (silent PostgREST no-op), or is skipped (non-string id guard), the code still fell through into COUNT/bump. `Math.max(1, trueCount ?? 1)` floored COUNT=0 to 1, so the bump wrote `log_count=1` and invalidated cache while the food_entries row remained orphaned. R1's invariant `log_count == COUNT(linked entries)` was permanently broken from first observation.
- **I1-R2 (Improvement/medium) — COUNT-then-literal-UPDATE can lose the newest count under 3+ concurrent saves.** Separate SELECT at 697-701 + literal UPDATE at 718-723 = a read-modify-write window where an older request's stale COUNT can overwrite a newer COUNT after the newer request's link landed. Self-heals on the next re-log via `/api/library/[id]/log-now`'s COUNT-from-statement pattern.

**R3 explicit-override auto-fix (Critical only, per user standing approval):** Gate-without-rollback.
1. Link UPDATE now passes `{ count: 'exact' }`; destructuring receives `{ error, count: linkCount }`.
2. `linkConfirmed` boolean — `!linkError && linkCount === 1`. Bump-COUNT-update-cache chain wrapped in `if (linkConfirmed)`; sketch arm gated via `else if (libRow && linkConfirmed)`.
3. Sentry observability preserved — `linkCount === 0` path synthesizes an `Error('…affected 0 rows…')` so Sentry's normalisation gets a real stack; scope tag differentiates `library_entry_link` (PostgREST error) from `library_entry_link_zero_rows` (silent no-op).
4. Rollback explicitly rejected per design-doc §10.3 ("library is enrichment, entry write is authoritative") — deleting the library row would race in-flight sibling tabs or orphan the winner's already-linked entry. Library row keeps DB-default `log_count = 0` consistent with reality; self-heals on next re-log.

**I1-R2 (lost-update race) deferred** to `pending_minor_findings` — Improvement-only at round-2-cap; self-healing property + low real-world hit rate (3+ concurrent saves on the same food in a single-user MVP) justifies deferring rather than overriding the cap a second time.

**Tests:**
- 5 R1 RED→GREEN: `Bug 1 + Codex R1 follow-up (C1 + I1)` describe block. COUNT(*)-derived count = 1 on fresh save, = 2 on simulated re-log; link UPDATE assertion; 23505 race recovery; non-23505 error preservation. AC1-error-path test updated to use non-23505 code since 23505 is now the recovery path.
- 3 R3 RED→GREEN: link UPDATE error → no bump/cache/sketch (200 OK); link UPDATE matches 0 rows → no bump/cache/sketch (200 OK); positive regression — confirmed link → bump + cache + sketch fire.
- Total batch additions in `tests/unit/api/entries-save.test.ts`: 8 new tests + extended `buildMocks()` for the new SELECT/UPDATE/COUNT chains.

**Test run results:** 25 unit + 137 integration = 162 GREEN, 0 failing (post-R3 sweep: entries-save unit 28/28, library integration 108/108, entries integration 37/37). Typecheck clean, lint clean on touched paths.

**Cross-cutting impact:** None outside the route. No schema migration. No new RLS policies (defense-in-depth `.eq('user_id', userId)` on every new SQL builder chain). `library_merge_atomic` RPC's `log_count` summation semantics unchanged.

---

### Bug 2 — Micronutrient amount shows "0 mg" alongside non-zero %RDA (Improvement user-facing)

**Title:** Library `MicrosReadOnly` rows showed e.g. "0 mg · 2% DV" — amount formatter rounded the underlying value to integer (`String(Math.round(0.3))` → `"0"`) while the percent formatter used the unrounded value, producing a self-inconsistent pair.
**Source file:** `app/(app)/library/_components/FoodDetail/foodDetail.format.ts` (`formatMilligrams`)
**Tests files:** `tests/unit/library/food-detail-format.test.ts`, `tests/components/library/FoodDetailMacros.test.tsx`
**Classification:** known_fix → display precision
**TDD required:** yes
**UI-touching:** true (display formatter; downstream FoodDetail view-mode renders both mg and mcg micros via this single formatter)
**Risk:** low (idempotent for `value === 0` and `value >= 1` inputs; only widens precision on the previously-collapsed `0 < value < 1` range)
**Final commit:** _set by Phase 8_

**Root cause:** `formatMilligrams` returned `String(Math.round(value))` collapsing any sub-1 value to `"0"`. The sibling `formatMicroPercent` (`lib/nutrition/display-micros.ts`) computed `Math.round((value / rda) * 100)` from the unrounded source. Bug pre-dated this batch (Task 4.2, 2026-04-24); the prior batch's `<1% RDA` filter (commit `61b9216`) made it user-visible by surfacing low-but-nonzero rows that previously hid under the implicit `consumed === 0` gate. Dashboard `MicroBreakdownDialog.formatAmount` already handled the case via `Number.isInteger(value) ? String(value) : value.toFixed(1)` — the canonical pattern to mirror.

**Fix:** 4-tier precision rule applied verbatim from proposal.
- `value === 0` → `"0"` (preserved)
- `0 < value < 0.05` → `value.toFixed(2)` (NEW — keeps trace amounts honest, prevents the new `"0.0 mg @ 2% DV"` regression that a 1-decimal-only rule would produce for `0.04`)
- `0.05 ≤ value < 1` → `value.toFixed(1)` (NEW — primary bug case, `0.3 → "0.3"`)
- `value ≥ 1` → `String(Math.round(value))` (preserved — `140.7 → "141"`, `1 → "1"`, `18 → "18"`)
- `null` / `undefined` / non-finite (`NaN`, `±Infinity`) → `"—"` (preserved + extended)

Behavior pins documented in tests: `(0.95).toFixed(1) === "0.9"` (banker's rounding on IEEE-754 binary representation, NOT `"1.0"`); `(0.05).toFixed(1) === "0.1"`. Both are monotonic in user-visible direction — never produce `"0.0"` for nonzero values, never inflate trace amounts.

**Tests:**
- 4 new precision-tier cases in `tests/unit/library/food-detail-format.test.ts`: 2-decimal tier (`0.01 → "0.01"`, `0.04 → "0.04"`), 1-decimal tier (`0.05 → "0.1"`, `0.3 → "0.3"`, `0.5 → "0.5"`, `0.95 → "0.9"`), integer tier (`1 → "1"`, `1.5 → "2"`, `18 → "18"`, `120 → "120"`), `value === 0 → "0"`. Plus em-dash tier extension (`undefined`, `NaN`, `Infinity`).
- 2 new component-level cases in `tests/components/library/FoodDetailMacros.test.tsx`: `iron_mg = 0.3` (1.67% RDA → "2%") asserts `"0.3 mg · 2% DV"` AND no `"0 mg"` regression; `vitamin_d = 0.2 mcg` (1% RDA) asserts the same 4-tier rule applies UNIFORMLY to mcg (the formatter handles both — `FoodDetailMacros.tsx:561+563`). Fixtures chosen to clear the `<1% RDA` filter (`sortAndFilterMicrosByRdaPct`) so the row actually renders.

**Test run results:**
- `food-detail-format.test.ts` — 19 GREEN.
- `FoodDetailMacros.test.tsx` — 46 GREEN.
- Full library component suite — 219 GREEN across 29 files.
- Dashboard breakdown sibling specs — 17 GREEN across 3 files (no incidental coverage breakage).

Pre-fix RED verification — broad vitest run flagged the new precision-tier cases failing with `AssertionError: expected '0' to be '0.01'`. Post-fix all green in 725 ms (unit) + 1.94 s (component). Typecheck clean. Lint: 0 errors / 0 warnings on touched files.

**Cross-cutting impact:** None. No schema change. No API contract change. No data-shape change. Sibling cholesterol macro-row in `FoodDetailMacros.tsx:482-483` uses the same `String(Math.round(value))` inline pattern but was intentionally OUT-OF-SCOPE per proposal — user explicitly said "micronutrients", and cholesterol's real-world values are 0–300 mg where sub-1 mg is degenerate display. Sibling flagged in follow-ups (below). `MicroBreakdownDialog.formatAmount` was NOT unified with the new formatter — separate surfaces, separate consumers, surgical-changes principle preserved; if Codex flags inconsistency in a future round the unified rule should be the 4-tier one.

**Codex assessment:** Bug 2 was silent in BOTH R1 and R2 verdicts — no Critical, no Improvement, no Minor. Concerns d–i from the framing prompt (`MicroBreakdownDialog` consistency, 0.95 banker's rounding, mcg semantics, cholesterol sibling, 0.05 boundary, "find the other N") were implicitly accepted.

---

## Codex Adversarial Review summary

**Round 1** (verdict: `needs-attention`)
- Bug 1 — C1 Critical (initial hardcoded `1` vs COUNT-derived re-log) + I1 Improvement (23505 race silent drop). Both auto-fixed in single sub-agent dispatch.
- Bug 2 — clean.
- Auto-retry signals: none. Size budget: clean (within 500 KB tier).

**Round 2** (retry after stash recovery; verdict: `needs-attention`, would have hit 2-round cap)
- Bug 1 — C1-R2 Critical (link failure publishes false bump) + I1-R2 Improvement/medium (3+ concurrent-saves lost-update). C1-R2 is a NEW finding (R1 closed C1's "missing link" but introduced "link-not-gated"); I1-R2 widens R1's accepted lost-update tolerance from 2→3+ request divergence.
- Bug 2 — still clean.
- Auto-retry signals: none.

**Round 3** (explicit override of 2-round cap, Critical-only scope)
- C1-R2 closed via `linkConfirmed` gating; bump + cache invalidation + sketch enqueue all behind the gate.
- I1-R2 deferred to `pending_minor_findings` per skill rule.
- Authorization: standing "go with your recommendation" user approval applied to the override.

**Files reviewed** by Codex (working-tree review): 5 batch files. Three concurrent-session debris files (`MacroBars.tsx`, `MicrosOverflowToggle.tsx`, `app/globals.css`) were excluded by scope guard; Codex respected the guard — no findings referenced them.

---

## Security review summary

**Reviewer:** bugfix-tomi security-review sub-agent (single round, Phase 6)
**Verdict:** APPROVED — advance to Phase 7.
**Counts:** 0 Critical / 0 High / 0 Medium / 1 Informational.

Coverage by category:
- **Input validation** — PASS. No new untrusted input paths; `computedNormalized` is server-derived from `firstItem.name` via `normalize.ts`; `insertedId` is server-controlled; `firstItem.micros` already bounded by `MAX_MICRO_VALUE`.
- **Authn/Authz** — PASS. Every new query is user-scoped — 23505 recovery SELECT, link UPDATE, COUNT, bump UPDATE all chain `.eq('user_id', userId)` for defense-in-depth above RLS.
- **PII handling** — PASS (with Informational note). New Sentry captures emit `extra: { userId, libraryItemId, ... }`; the scrubber's `USER_PII_KEYS` only matches the `user.*` branch, so internal UUIDs survive in `extra.*`. Matches pre-existing pattern in the same file (`save/route.ts:363, 402, 466, 506`). Not a regression introduced by this batch.
- **Injection vectors** — PASS. All new queries use Supabase JS builder methods; PostgREST parameterizes; no string concatenation.
- **Secret leakage** — N/A. No new secret handling.
- **XSS / CSRF** — N/A. Server-side route only; `formatMilligrams` returns a plain string into React text rendering.
- **Race conditions** — PASS (residual I1-R2 deferred). `linkConfirmed` is function-scope `let` per handler invocation (no shared state); bump and sketch arms gated; orphan-row attack vector validated as low risk (server-generated UUIDs, RLS-bounded per-user impact).
- **Open redirects** — N/A.
- **Resource exhaustion** — PASS. COUNT bounded by single-user data; index `food_entries_user_logged_at_idx` doesn't cover `library_item_id` (perf concern, not security — flagged for future indexing review).
- **Error response leakage** — PASS. All four new error paths Sentry-captured server-side; client responses uniform 200/500 with safe identifier strings.

**Informational finding (carry-forward):** INFO-1 — `extra.userId` in Sentry captures. Pre-existing project convention; UUIDs survive scrubber. Optional enhancement: add `'userid'`, `'user_id'`, `'libraryitemid'` (lowercased) to `PII_KEYS` in `lib/sentry/before-send.ts`. Not blocking.

---

## E2E + UI testing summary

**Phase:** 7 — Visual regression only (no functional E2E warranted under bugfix-tomi conditional-E2E rule).
**Session id:** `phase-7-2026-05-17T17:59Z`
**Verdict:** PASS — advance to Phase 8.
**Specs run:** 3 specs × 3 chromium projects (mobile / tablet / desktop) = 9 invocations.
**Functional E2E run:** 0 (Bug 1 fully unit-covered at `entries-save.test.ts`; Bug 2 fully covered at `food-detail-format.test.ts` + `FoodDetailMacros.test.tsx`).
**Visual baselines refreshed:** 0 (correctly).

All 9 visual diffs diagnosed as **pre-existing drift** from commits landed AFTER the last baseline refresh (`07273a3`):

| Spec | Diff pattern | Pre-existing drift sources |
|---|---|---|
| `tests/visual/library.spec.ts` × 3 viewports | Page height grew 16px (1393→1409 mobile); library card overlay buttons + bottom-nav repositioned; the "1×" badge on the seeded "Charlie" card is identical baseline vs actual (seeded with `log_count=0` and never logged in spec). | `867d448`, `6f23f46`, `48b1855`, `61b9216`, `68a3aee`, `cc1d41a` |
| `tests/visual/dashboard.spec.ts` × 3 viewports | Whole-page layout shift; new "1 issue" notification toast in actual; meal stepper / water FAB / micros panel structure changed. Empty-state fixture renders zero micros, so Bug 2 cannot be the cause. | Multiple dashboard-chrome commits post-`07273a3` |
| `tests/visual/log-confirmation.spec.ts` × 3 viewports | Tab labels rewritten; new HIGH-PROTEIN filter chip; library cards re-laid out (mono initials + 5-macro row). Log-flow library cards show macros only, no milligram micros, so Bug 2 cannot be the cause. | `68a3aee`, `48b1855`, `6f23f46`, `60e85c5` |

Per memory note L164 ("visual baselines should be regenerated AFTER all layout-affecting fixes accumulated, not piecemeal per bugfix batch") and `tasks.md` Task 14 ("visual baseline refresh deferred to CI"), drift remediation is tracked separately under `FOLLOWUP-VISUAL-BASELINE-DRIFT`.

**Interaction blockers encountered:** `reuseExistingServer: false` blocked playwright launch with `.env.test.local` present + running dev server on :3000. Resolved by setting `CI=1` to omit the `webServer` block; both `.env.local` and `.env.test.local` point at the same dev Supabase ref (`aaiohznsqlqchsoxaqkz`), so reuse was safe.

**Total wall-clock:** ~3 minutes.

---

## Recovery incidents

### Incident 1 — Concurrent-session stash wipe (2026-05-17, between R1 and R2)

**Detected at:** R2 first-attempt pre-flight (before Codex invocation).
**Description:** A concurrent Claude Code session executed a stash+reset that parked the R1 implementation (5 files, ~645+/2- per `git stash show --stat`) into `stash@{0}` (message `STASH-CONCURRENT-LIBFIX-2`). The first R2 Codex invocation ran against the wiped working tree and falsely reported R1 C1 + I1 as unresolved Critical findings.
**Diagnostic verification (per `codex/r2-recovery-diagnostic.md`):**
1. Working tree had Bug 1 partial fix (hard-coded `log_count: 1` + `last_used_at`) but ALL FOUR R1 additions absent — no link UPDATE, no 23505 SELECT, no COUNT bump, cache-invalidation still on libRow-success branch.
2. `stash@{0}` contained EXACTLY the four missing R1 deltas — message + diff signature matched the R1 sub-agent's reported scope verbatim.
3. Cross-referenced with project memory note `feedback_commit_fast_on_concurrent_sessions.md` ("multiple Claude Code sessions can run concurrently … sibling stash+reset wipes uncommitted work").
**Resolution:** Main agent ran `git stash pop stash@{0}`. R2 RETRY pre-flight verified all 4 R1 elements present on disk (link UPDATE at lines 668-674, 23505 recovery SELECT at 626-657, COUNT-derived bump at 697-723, cache invalidation moved to bump-success branch at 741-742). Codex R2 RETRY then proceeded against the recovered tree.
**Debris files identified at recovery time:** `components/dashboard/MacroBars.tsx`, `components/dashboard/MicrosOverflowToggle.tsx`, `app/globals.css`. By Phase 7 (per security-review.md cross-check), these had cleared from the working tree (committed or re-stashed by the concurrent session). Phase 8 commit uses targeted `git add` to exclude any remaining unrelated modification.

---

## Pending follow-ups

### Improvement / Minor (deferred, in priority order)

1. **I1-R2 — `log_count` lost-update race under 3+ concurrent saves**
   - **File:** `app/api/entries/save/route.ts:697-723`
   - **Description:** COUNT-then-literal-UPDATE pattern lets a stale older request overwrite a newer COUNT after the newer request landed. 3-request race converges to wrong final value.
   - **Severity:** Improvement (medium).
   - **Self-heal:** Next re-log via `/api/library/[id]/log-now` runs COUNT-from-statement and corrects the row.
   - **Proposed fix:** Inline `UPDATE food_library_items SET log_count = (SELECT COUNT(*) FROM food_entries WHERE library_item_id = $1 AND user_id = $2)` — same pattern as `log-now` route post-Codex-R1.
   - **Rationale for defer:** Improvement-only residual at round-2-cap; R3 override scoped to Critical only; vanishingly rare in single-user MVP.

2. **INFO-1 — Sentry `extra.userId` not in PII scrub keys**
   - **File:** `lib/sentry/before-send.ts::PII_KEYS` (the scrubber config)
   - **Description:** Internal Supabase user UUIDs survive into Sentry via `extra.userId` because `USER_PII_KEYS` only matches the `user.*` branch. New R1/R3 captures match the same pre-existing pattern at `save/route.ts:363, 402, 466, 506`.
   - **Severity:** Informational.
   - **Proposed enhancement:** Add `'userid'`, `'user_id'`, `'libraryitemid'` (lowercased) to `PII_KEYS`. Defer until project-wide PII-scrub audit.

3. **Sibling cholesterol macro-row uses `String(Math.round(value))` inline pattern**
   - **File:** `app/(app)/library/_components/FoodDetail/FoodDetailMacros.tsx:482-483`
   - **Description:** Same precision asymmetry as Bug 2 but on the cholesterol macro row. NOT auto-fixed in this batch per proposal — user said "micronutrients", real-world cholesterol values are 0–300 mg where sub-1 mg is degenerate.
   - **Severity:** Minor (cosmetic).
   - **Proposed fix:** If a future batch unifies amount formatters, extract `formatMilligrams`'s 4-tier rule into a shared `lib/nutrition/formatters.ts` and have both call sites consume it.

4. **FOLLOWUP-VISUAL-BASELINE-DRIFT** — pre-existing baseline drift across 9 (spec × viewport) combinations
   - **Files:** `tests/visual/{library,dashboard,log-confirmation}.spec.ts` × 3 viewports each
   - **Source commits:** `867d448`, `6f23f46`, `48b1855`, `61b9216`, `68a3aee`, `cc1d41a`, `60e85c5`, multiple dashboard chrome commits between `07273a3` and HEAD.
   - **Disposition:** Refresh in a dedicated visual-rebaseline workflow per `tasks.md` Task 14 (`167dc91 docs(planning): Task 14 visual baseline refresh deferred to CI`) and memory note L164.

---

## Commits in batch

| SHA | Author | Summary |
|---|---|---|
| _set by Phase 8_ | Phase 8 commit step | Combined commit covering 5 batch files + Planning artifacts (CHANGELOG entry + manifest move + docs) per concurrent-session-fast-commit policy. |

(Inter-phase commits not separately recorded — implementation, R1 auto-fix, and R3 auto-fix all flowed through working-tree edits without intermediate commits per the bugfix-tomi batched-commit model. The stash recovery (`git stash pop stash@{0}`) was a working-tree restore, not a commit.)

---

## Artifacts

- `proposals/bug-1.md`, `proposals/bug-2.md`
- `outputs/bug-1.md`, `outputs/bug-2.md`
- `codex/round-1.md`, `codex/round-1-categorized.md`, `codex/fixes-r1-entries-save.md`
- `codex/r2-recovery-diagnostic.md`
- `codex/round-2.md`, `codex/round-2-categorized.md`, `codex/fixes-r3-link-gate.md`
- `security-review.md`
- `e2e-results.md`
- `project-context.md`
- `lessons-relevant.md`

All artifacts moved verbatim from `Planning/.tmp/bugfix-2026-05-17-library-card-and-micros-precision/` to this directory at Phase 8 docs-write. Original `.tmp/` batch directory deleted by the same step (state file `state.md` retained inline above rather than copied separately — superseded by this manifest).

---

## Status

**closed (pending Phase 8 final commit)** — all 2 bugs implemented + tested + reviewed; R3 explicit-override closed the last Critical; 1 Improvement deferred to follow-ups; security clean; visual drift correctly attributed to pre-existing pre-batch commits.
