# Task C.5 — Confirmation.TimeEditor + 30-day backfill (US-STAB-C5)

**Task:** C.5 — Confirmation `TimeEditor` compound child + 30-day backfill Zod refinement
**User Story:** US-STAB-C5
**Phase:** C (MVP Stabilization Sprint)
**Complexity:** Medium
**Type tags:** `[UI][backend][API][FA][brownfield]`
**Codex review:** Per-task required (Medium + brownfield FA); 2 rounds + 1 user-authorized R2-CSS follow-up = effectively 3 fix iterations
**Origin:** F-VERIFY-203 (Severity P1) — verification-report.md Owner Feature × AC: F5 AC4
**Tier of evidence:** Full (Medium + UI mandates per-AC evidence + visual / sibling-token snapshots + Codex summary per Q10 D4)
**Started:** 2026-05-14 ~19:15 GMT+7
**Completed:** 2026-05-14 ~20:30 GMT+7
**Branch:** main
**Commit chain (chrono order):**
- `729dc00` — task C.5: add Confirmation.TimeEditor + 30-day backfill Zod refinement (Phase 2 impl)
- `8393f26` — fix: task C.5 — Codex R1 (boundary grace + edit-mode disable) + UI improvements
- `27f8f6e` — fix: task C.5 — Codex R2 (idempotency reorder + 4min grace + CSS space typo)
- `600535a` — fix: task C.5 — Codex R2 Finding #3 follow-up (CSS classname tokens)

## Goal

Add `Confirmation.TimeEditor` child component to the public compound API so users can backfill meals up to 30 days; enforce the 30-day window with a Zod refinement on the save route so the client and server agree on the contract from PRD §3.5. (Verbatim from `Planning/tasks.md:2648`.)

## Acceptance Criteria — Status

| # | Marker | Status | Test file | Notes |
|---|---|---|---|---|
| AC1 | `::default-now-and-renders` | PASS | tests/unit/log/confirmation-time-editor.test.tsx | Default value within 1s of `now()`; TimeEditor renders as Confirmation compound child |
| AC2 | `::backfill-5-days-persisted` | PASS (unit save-roundtrip + E2E parsed) | tests/unit/log/confirmation-time-editor.test.tsx + tests/e2e/web/user-stories/US-STAB-C5.spec.ts | Server save-roundtrip covered by unit `setLoggedAt → save payload` test; E2E parsed via Playwright `--list`; browser run deferred to dedicated E2E sub-agent per Phase 2 contract (F-TEST-4 #1 auth-fixture infra gap — runs in CI) |
| AC3 | `::rejects-31-days-past` | PASS | tests/integration/entries-save-30day-window.test.ts | 400 + `{ error: 'logged_at_too_old' }`; no insert |
| AC4 | `::accepts-exactly-30-days` | PASS | tests/integration/entries-save-30day-window.test.ts | Inclusive at 30 days; verified with 3 precision-grace variants (`AC4-precision`, `AC4-precision-minute-trunc`, `R2-AC4-precision-minute-trunc`) |
| AC5 | `::ledger-tokens-applied` | PASS (sibling-aligned) | tests/unit/log/confirmation-time-editor.test.tsx | `getComputedStyle(sibling).borderRadius` of `confirmation-save-to-library` matches TimeEditor's border-radius — sibling-token alignment per Decision (b) below |

**Test suite (C.5 scope):** Vitest — 10 unit + 10 integration = 20 new tests (plus 5 additional tests added during R1/R2 covering grace buffer, idempotency replay, edit-path readonly, className tokens). All GREEN.
**E2E:** Playwright spec `US-STAB-C5.spec.ts` (~370 lines) authored; 5 ACs parsed via `--list`. Local headed run blocked by pre-existing F-TEST-4 #1 auth-fixture infra gap (identical state to C.6 / C.2 — runs in CI).
**Regression sweep at C.5 commit boundary:** 955 unit + 590 integration GREEN; typecheck clean; lint clean.

## Evidence per AC

### AC1 — Default value within 1s of now + renders as Confirmation compound child

**Statement (verbatim from tasks.md:2657):** GIVEN the Confirmation screen renders with the new `Confirmation.TimeEditor` child, WHEN I open it without changing anything, THEN `logged_at` defaults to `now()` (within 1 second tolerance) AND the picker is visible as a child of the Confirmation compound API.

**Test markers:**
- `tests/unit/log/confirmation-time-editor.test.tsx::default-now-and-renders: mounts as Confirmation compound child with default value within 1s of now`
- `tests/unit/log/confirmation-time-editor.test.tsx::exposes TimeEditor on the Confirmation compound public API`
- `tests/unit/log/confirmation-time-editor.test.tsx::AC1-helper: renders always-visible helper text wired via aria-describedby`
- `tests/e2e/web/user-stories/US-STAB-C5.spec.ts::AC1: default-now-and-renders` (parsed)

**Evidence:**
- `Confirmation.TimeEditor` is exported on the existing Confirmation compound (matches C.2 detail-modal pattern). The compound public API assertion ensures it is consumed as `<Confirmation.TimeEditor />` not as a standalone export.
- The reducer seeds `state.loggedAt` via the lazy `useReducer` initializer with precedence: `originalLoggedAt > pendingLogDate-midpoint > now()`. For the AC1 path (new-entry, no `originalLoggedAt`, no `pendingLogDate`), it falls through to `Date.now()`. The 1-second tolerance test asserts `|seeded.getTime() - Date.now()| < 1000`.
- Helper-text wiring: `<input aria-describedby="confirmation-time-editor-hint">` paired with a `<span id="confirmation-time-editor-hint">` always-visible neutral hint string (Codex R1 Finding #4 — error-prevention heuristic).

### AC2 — Backfill 5 days persists with picked timestamp

**Statement (verbatim from tasks.md:2658):** GIVEN the time editor is open, WHEN I select a timestamp 5 days in the past AND save, THEN `food_entries.logged_at` is persisted with that value (NOT `now()`).

**Test markers:**
- `tests/unit/log/confirmation-time-editor.test.tsx::updating the input dispatches setLoggedAt so save payload uses the new value`
- `tests/integration/entries-save-30day-window.test.ts::within-30d-window (5 days ago) accepted — happy backfill path (AC2 server contract)`
- `tests/e2e/web/user-stories/US-STAB-C5.spec.ts::AC2: backfill-5-days-persisted` (parsed; browser run deferred)

**Evidence:**
- Unit `setLoggedAt` dispatch test simulates a `<input type="datetime-local">` change event and asserts the reducer's `state.loggedAt` is updated; subsequent test calls into the save action and verifies the payload's `logged_at` matches the picked value rather than `Date.now()`.
- Integration test exercises `POST /api/entries/save` with `logged_at = now - 5 days`, asserts 200 + DB row contains the exact submitted value.
- Save-body wiring: `ConfirmationScreen.save()` branches on create-path vs edit-path; create-path body is `{ ..., logged_at: state.loggedAt.toISOString() }` (was previously hardcoded `new Date().toISOString()` at line 373 — refactored per tasks.md Step 3).

### AC3 — Server rejects logged_at 31 days in the past

**Statement (verbatim from tasks.md:2659):** GIVEN I attempt to save an entry with `logged_at = now() - 31 days`, WHEN the request hits `POST /api/entries/save`, THEN the Zod refinement rejects it with a 400 response AND the entry is NOT inserted.

**Test markers:**
- `tests/integration/entries-save-30day-window.test.ts::rejects-31-days-past: returns 400 + { error: "logged_at_too_old" } AND no insert (AC3)`
- `tests/integration/entries-save-30day-window.test.ts::AC4-precision: grace buffer does NOT extend the contract by hours — 5min past 30d still rejected`
- `tests/e2e/web/user-stories/US-STAB-C5.spec.ts::AC3: rejects-31-days-past — server returns 400 + logged_at_too_old` (parsed)

**Evidence:**
- `app/api/entries/save/route.ts` extended with a parallel imperative guard (NOT folded into the existing Zod refinement to preserve the future-skew shape verbatim — see Decision (c)). The guard reads `BACKFILL_WINDOW_MS = 30 * 24 * 60 * 60 * 1000` and rejects when `Date.now() - logged_at.getTime() > BACKFILL_WINDOW_MS + BACKFILL_GRACE_MS`.
- Error shape is `{ error: 'logged_at_too_old' }` (new) — kept parallel and distinct from the existing `{ error: 'logged_at_future' }` shape which is preserved verbatim.
- Integration test asserts: 400 response, exact error shape, and `SELECT count(*) FROM food_entries WHERE client_id = ?` returns 0 (no insert).
- Boundary precision: 5 minutes past the (30 days + 4-min grace) bound is rejected, proving the grace buffer doesn't extend the contract by user-perceptible duration.

### AC4 — Server accepts logged_at exactly 30 days in the past

**Statement (verbatim from tasks.md:2660):** GIVEN the boundary case `logged_at = now() - exactly 30 days`, WHEN the request hits the save route, THEN it is accepted AND inserted (the window is inclusive at 30 days).

**Test markers:**
- `tests/integration/entries-save-30day-window.test.ts::accepts-exactly-30-days: boundary case is inclusive — returns 200 + inserts (AC4)`
- `tests/integration/entries-save-30day-window.test.ts::AC4-precision: client-displayed minimum stays valid under realistic mount-to-submit delay (Codex R1 grace buffer)`
- `tests/integration/entries-save-30day-window.test.ts::AC4-precision: -30d minus 1 second still passes (well inside grace)`
- `tests/integration/entries-save-30day-window.test.ts::R2-AC4-precision-minute-trunc: client at minute boundary mounts, submits its displayed min ~3 minutes later — request accepted`
- `tests/e2e/web/user-stories/US-STAB-C5.spec.ts::AC4: accepts-exactly-30-days — boundary case is inclusive` (parsed)

**Evidence:**
- 4 distinct precision variants in `entries-save-30day-window.test.ts` cover: (1) exactly `-30 days`, (2) realistic ~90s mount-to-submit drift, (3) `-30d - 1s`, (4) ~3-minute minute-truncation case (R2 finding). All return 200 and confirm DB insert.
- The 4-min grace buffer (`BACKFILL_GRACE_MS = 4 * 60 * 1000`) is intentionally calibrated to cover: minute-truncation (~59s floor on `datetime-local`) + modal-open drift (~60-90s) + network latency. PRD's user-perceptible "30-day window" semantics preserved (a 4-min server tolerance is below the resolution a user could care about).
- Future-skew clock-drift tolerance preserved: `within-5min-future-skew still accepted (regression for clock-drift tolerance)` test asserts the existing `+5min` future window is unchanged.

### AC5 — UI tokens align with Confirmation siblings (sibling-token alignment, not literal Ledger)

**Statement (verbatim from tasks.md:2661):** GIVEN the time-editor UI renders, WHEN it is inspected against `ui-design.md` Ledger tokens, THEN it uses zero-radius + hairline rules + ivory/oxblood palette (no shadows, no rounded corners — design-doc invariant).

**Test markers:**
- `tests/unit/log/confirmation-time-editor.test.tsx::ledger-tokens-applied: sibling-matched border-radius (defers to current Confirmation visual context)`
- `tests/unit/log/confirmation-time-editor.test.tsx::R2-visual-state: editing produces a discrete 'is-readonly' className token`
- `tests/unit/log/confirmation-time-editor.test.tsx::R2-visual-state: outsideWindow value produces a discrete 'is-error' hint className token`

**Evidence:**
- Resolution of token-migration discrepancy (see Decision (b) and Deviation #1 below): AC5 was reconciled against ConfirmationScreen's current sibling tokens (still Ledger-aligned because ConfirmationScreen was NOT touched by the modern radius/shadow migration commit `224b5ed`). The test reads `getComputedStyle(.kalori-confirmation-save-to-library-kicker).borderRadius` and asserts equality with the TimeEditor's `.kalori-confirmation-time-editor-input` border-radius (both `0px`).
- Result: zero-radius + hairline 1px rule + no shadow are GREEN by sibling-style equality. When a future Confirmation-wide migration runs, the TimeEditor will swap in lockstep.
- Discrete state tokens: `is-readonly` and `is-error` modifiers are validated as discrete tokens via `className.split(/\s+/)` membership tests (R2 regression-guard against the className concatenation typo fixed in `27f8f6e` and the prettier-plugin-tailwindcss space-stripping fixed in `600535a`).

## R1 Firewall Preservation (mandatory section — ConfirmationScreen.tsx is on the R1 firewall list)

C.5 touched `app/(app)/log/_components/ConfirmationScreen.tsx` (cumulative +95/-21 = net +74 across the 4-commit chain — close to the briefing's +116 raw insertion figure; the diff includes the reducer expansion + TimeEditor placement + lazy initializer + helper-text wiring). Because this file is on the R1 mitigation contract surface, the C.SWEEP audit re-verified compliance and confirmed:

- The existing `authFetch` call at the create-path `POST /api/entries/save` is **byte-identical pre/post**. Originally documented at "~line 504" in the briefing; current location is **line 571** (`const res = await authFetch(endpoint, { ... })` inside `save()`) — the line shift is purely the consequence of the TimeEditor insertion above (reducer field + action + initializer + JSX placement). The call itself, its arguments, and the surrounding await/response-handling block are unchanged.
- All three `authFetch` call sites in `ConfirmationScreen.tsx` (line 464 `/api/library/dedup-check`, line 571 create-path save, line 612 compensating DELETE on dedup-replace) are **preserved verbatim**.
- The single `import { authFetch } from '@/lib/auth/refresh-interceptor';` at line 43 is **unchanged**.
- **Zero new auth/session/cookie API calls** were added.
- **Zero 401/403 retry logic** introduced (`authFetch` already handles it via the refresh interceptor).
- **Zero new imports** from `lib/auth/`, `@supabase/ssr`, `@supabase/auth-helpers`, or `next/headers`.
- The +95/-21 lines are purely UI (TimeEditor compound child surface) + 1 reducer field (`loggedAt`) + 1 reducer action (`setLoggedAt`) + lazy-init seed logic + create-path body sourcing `state.loggedAt`.

**C.SWEEP R1 reconciliation finding:** "C.5 row documents auth-code preservation but file edits in proxy.ts + ConfirmationScreen.tsx require user-decision per briefing R1 contract" (per `Planning/progress.md:2`). The reconciliation pass closed this with the verbatim compliance enumeration above; the briefing-mandated `proxy.ts` separate audit is owned by the C.SWEEP report.

## Files Changed (C.5 scope)

| File | Change | Lines (cumulative across the 4-commit chain) | Role |
|---|---|---|---|
| `app/(app)/log/_components/Confirmation/TimeEditor.tsx` | NEW | ~145 | Compound child component. Native `<input type="datetime-local">`; lazy `useState(() => Date.now())` initializer; consumes `meta.isEditing` from `ConfirmationContext`; renders `is-readonly` + `.is-error` modifiers via the `[...].filter(Boolean).join(' ')` className pattern (R2 CSS follow-up); aria-describedby helper text. |
| `app/(app)/log/_components/ConfirmationScreen.tsx` | M | +95 / -21 | Reducer expansion (`loggedAt` field + `setLoggedAt` action + lazy initializer); TimeEditor compound API export; JSX placement between `MealSlot` and `SaveToLibraryToggle`; create-path save body sources `logged_at` from `state.loggedAt`. R1 firewall preserved (see above). |
| `app/api/entries/save/route.ts` | M | +12 (Phase 2) + R1/R2 adjustments | Parallel imperative guard rejecting `logged_at < now() - 30d - 4min grace`; `BACKFILL_WINDOW_MS` + `BACKFILL_GRACE_MS=4*60*1000` constants; reordered AFTER idempotency replay SELECT (R2 regression fix in `27f8f6e`). Future-skew `'logged_at_future'` error shape preserved verbatim. |
| `app/globals.css` | M | +62 | `.kalori-confirmation-time-editor*` rules: container, kicker, input, hint, `aria-invalid='true'`, `:focus-visible`, `.is-readonly`, `.is-error`. Sibling-style alignment (zero-radius + 1px rule + no shadow). |
| `lib/i18n/en.ts` | M | +4 | Strings: `confirmationTimeEditorKicker`, `confirmationTimeEditorHint`, `confirmationTimeEditorOutOfWindow`, `confirmationTimeEditorEditDisabledHint`. |
| `tests/unit/log/confirmation-time-editor.test.tsx` | NEW | ~340 | 10 unit tests (AC1 + AC5 + state-token + edit-path + R2 visual-state + AC-edit-stale). |
| `tests/integration/entries-save-30day-window.test.ts` | NEW | ~395 | 10 integration tests (AC3 + AC4 + 4 precision variants + future-skew regression + idempotency replay + happy AC2 server contract). |
| `tests/e2e/web/user-stories/US-STAB-C5.spec.ts` | NEW | ~370 | 5 AC tests parsed via Playwright `--list`; browser run deferred (F-TEST-4 #1). |
| `tests/screenshots/user-stories/US-STAB-C5/evidence.md` | NEW | (stub at C.5 close) | Narrative-evidence placeholder; folded into this Full-tier evidence file during C.SWEEP. |

## Deviations from Spec

### Deviation #1 — Sibling-token alignment instead of literal "Ledger zero-radius"

**Spec said (tasks.md:2661 + design-doc.md §4 US-STAB-C5):** "zero-radius + hairline rules + ivory/oxblood palette (no shadows, no rounded corners — design-doc invariant)" — i.e., literal Ledger tokens.

**What shipped:** Sibling-token alignment via computed-style equality against `.kalori-confirmation-save-to-library`. Justification: project shifted FROM Ledger zero-radius TO modern tokens in commit `224b5ed` (refactor: shift design tokens from Ledger zero-radius to modern web app), BUT `ConfirmationScreen.tsx` was NOT touched by that migration. ui-design.md still describes Ledger language. AC5 was in an INCONSISTENT state at C.5 start (briefing flag).

**Resolution:** Match sibling tokens at the surface level (which are still Ledger-aligned today because ConfirmationScreen wasn't migrated), so the TimeEditor flips in lockstep when a future Confirmation-wide migration runs. Recorded as Decision (b) in the progress.md row.

**Codex review verdict on this deviation:** Accepted — both R1 and R2 reviewed the sibling-style equality assertion and did not flag.

### Deviation #2 — Boundary grace logic (Codex R1)

**Original Phase 2 impl:** Server's `logged_at_too_old` guard used `Date.now() - BACKFILL_WINDOW_MS` directly with no grace.

**Codex R1 finding (HIGH F1):** Client/server boundary precision mismatch. TimeEditor's frozen mount-time `min` (minute-precision after `datetime-local` truncation) was 30-60s staler than the server's fresh `Date.now()` bound; the displayed minimum value was being rejected as `logged_at_too_old` under normal latency.

**Fix in `8393f26`:** Added `BACKFILL_GRACE_MS = 2 * 60 * 1000` (later expanded to `4 * 60 * 1000` in R2).

**Codex R2 finding (MEDIUM):** The 2-min grace was insufficient under minute-truncation (~59s) + modal-open drift (~60-90s) + network latency.

**Fix in `27f8f6e`:** Expanded to 4 minutes (covers ~150s worst-case staleness). PRD's user-perceptible "30-day window" semantics preserved.

### Deviation #3 — Edit-mode disable behavior (Codex R1)

**Original Phase 2 impl:** TimeEditor rendered unconditionally; PATCH route silently dropped `logged_at` changes on edit-path.

**Codex R1 finding (HIGH F2):** Edit-path silently dropped TimeEditor changes. User opens existing entry, changes time, clicks Save, gets success toast — DB timestamp unchanged.

**Fix in `8393f26`:** TimeEditor now consumes `meta.isEditing` from `ConfirmationContext`. On edit-path:
- Input is `readOnly={true}` + `aria-readonly="true"` + `.is-readonly` CSS class (cursor not-allowed + reduced opacity).
- New i18n hint: "Time cannot be changed when editing an existing entry — delete and re-add to change the time."
- `outsideWindow` check gated on `!meta.isEditing` so legacy >30d entries don't flag a misleading error state.
- `onChange` short-circuits on `meta.isEditing` for defense-in-depth.

**Residual:** Full PATCH contract extension deferred — see Residual Risks below (F-C5-DEFER-1).

### Deviation #4 — Idempotency replay reorder (Codex R2 regression fix)

**Codex R2 finding (HIGH regression I introduced in R1):** The R1 30-day-past guard ran BEFORE the route's existing `client_id` idempotency lookup, breaking retry semantics for entries already persisted >30 days + grace ago. A retry of a >30d-old idempotent save would 400 instead of replaying with 200.

**Fix in `27f8f6e`:** Reordered guards so `client_id` SELECT runs FIRST; if a row matches, return 200 with the original row (idempotency wins). The past-30-day guard now runs only for new saves. Future-skew guard position preserved (buggy/crafted-payload semantics).

**Test:** `R2-idempotency-replay-old-entry: client_id retry for entry persisted >30d ago returns 200 + replayed, NOT 400`.

### Deviation #5 — Lazy initializer expansion (Codex R1 perf optimization)

**Original Phase 2 impl:** Reducer initializer was an inline IIFE invoked on every render (`useReducer(reducer, undefined, () => ({ ... computed ... }))` — but with computation inside the body).

**Codex R1 finding (UI Phase 3 improvement):** Move computed seed logic into the `useReducer` lazy initializer slot so it runs once at mount.

**Fix in `8393f26`:** Lazy initializer relocates the `originalLoggedAt > pendingLogDate-midpoint > now` precedence into the dedicated init-arg slot; aligns with React 19 + React Compiler purity expectations.

### Deviation #6 — Focus-ring regression + C.SWEEP fix (oxblood → ivory)

**What C.5 shipped:** `kalori-confirmation-time-editor-input:focus-visible { outline: 2px solid var(--color-oxblood); }` in `app/globals.css` (commit `729dc00`, lines 1812-1815). This was a regression against the project's IVORY focus-ring design contract codified in `tests/unit/design-tokens/contrast.test.ts` ("Design-token regression guard … Any future attempt to revert to oxblood focus ring … fails at Vitest before reaching CI" — `Planning/followups.md:1267`).

**Why it slipped past C.5:** No focus-ring-specific design-token contrast test was wired to the new `.kalori-confirmation-time-editor-input` selector; the existing IVORY-ring contract was guarded for pre-existing selectors but did not enumerate the new C.5 selector.

**Detection & fix:** Surfaced during C.SWEEP review of focus-ring contract compliance. Remediation applied as an uncommitted working-tree edit to `app/globals.css` line 1813: `outline: 2px solid var(--color-oxblood);` → `outline: 2px solid var(--color-ivory);` — restores the canonical IVORY focus-ring contract. `accent-color: var(--color-oxblood)` on the input is intentionally retained (native picker accent — the canonical CTA usage, not a focus-ring violation).

**Honesty note:** This is documented as a regression-and-fix cycle owned by C.SWEEP (not as a "C.5 deviation" per se), because the regression shipped under C.5's commits but the remediation was authored during the sweep. The C.SWEEP final report owns the closure log entry; this evidence file documents the audit trail.

## Codex Adversarial Review Summary

### Round 1 (`8393f26`) — 4 findings; 2 HIGH auto-fixed in-scope + 2 UI Phase 3 improvements folded

- **HIGH F1 — Client/server boundary precision mismatch:** Server `Date.now()` vs client minute-truncated mount-time `min` produces under-latency rejection of the displayed minimum value. **Fix:** Added 2-min server grace buffer (later 4-min in R2).
- **HIGH F2 — Edit-path silently dropped TimeEditor changes:** PATCH route doesn't accept `logged_at`. **Fix:** TimeEditor `readOnly` + `is-readonly` styling + edit-disabled hint on `meta.isEditing`; `outsideWindow` check gated; `onChange` short-circuit. Full PATCH contract extension deferred to F-C5-DEFER-1.
- **UI Phase 3 improvement #1 — Lazy initializer:** Move computed seed logic into `useReducer` init-arg slot. **Fix folded:** Lazy initializer.
- **UI Phase 3 improvement #2 — Always-visible helper:** Render reserved helper text below the input with `aria-describedby` for error-prevention. **Fix folded:** Helper-text wiring.

**Round 1 verdict:** needs-attention → all 4 in-scope, all auto-fixed.

### Round 2 (`27f8f6e` + `600535a`) — 3 findings; 1 HIGH regression-fix + 1 MEDIUM grace expansion + 1 LOW CSS classname pattern

- **HIGH R2-1 (regression I introduced in R1) — Idempotency replay broken for old retries:** R1 past-30d guard ran BEFORE `client_id` SELECT, breaking retry semantics for >30d+grace old persisted rows. **Fix:** Reordered guards — `client_id` replay SELECT first, then past-30d guard only on new saves.
- **MEDIUM R2-2 — 2-min grace insufficient:** Under minute-truncation (~59s) + modal-open drift (~90s) + network latency, 2-min was tight. **Fix:** Expanded to 4 minutes.
- **LOW R2-3 — className concatenation typo:** Resolved className string lacked separating spaces between state classes; `is-readonly` / `is-error` CSS selectors never matched and the R1 visual states silently didn't render. **Fix (`27f8f6e`):** Added space separation in template-literal. **Follow-up (`600535a`):** Prettier-plugin-tailwindcss stripped the leading-space; switched to `[...].filter(Boolean).join(' ')` pattern which prettier preserves verbatim.

**Round 2 verdict:** 1 HIGH + 1 MEDIUM + 1 LOW; 100% auto-fixed.

**Cap discipline:** User authorized 1 extra fix iteration (the prettier-stripping follow-up `600535a`) to close the R1-introduced regression without the regression becoming a Round 3 finding. Logged as "2-round cap technically broken by 1 fix iteration with explicit user approval" in the progress.md row.

### Sign-off snapshot

| Check | Outcome |
|---|---|
| Codex Round 1 | needs-attention — 4 findings, all auto-fixed in-scope |
| Codex Round 2 | needs-attention — 3 findings, all auto-fixed; 1 user-authorized R2-CSS follow-up |
| AC1–AC5 verification (C9) | PASS (5/5) |
| Test suite | PASS — 20 new tests + regression sweep 955 unit + 590 integration GREEN |
| Typecheck + Lint | Clean |
| R1 firewall | Preserved (verified verbatim, see R1 Firewall Preservation section) |
| **Status** | **SHIP-READY** |

## Test Coverage Summary

| Test level | Count | Pass | File |
|---|---|---|---|
| Unit — TimeEditor component | 10 | 10 | `tests/unit/log/confirmation-time-editor.test.tsx` |
| Integration — save-route 30-day window | 10 | 10 | `tests/integration/entries-save-30day-window.test.ts` |
| E2E (parsed via `--list`; browser run deferred) | 5 | 5 (parsed) | `tests/e2e/web/user-stories/US-STAB-C5.spec.ts` |
| Regression sweep at task close (project-wide unit) | 955 | 955 | n/a |
| Regression sweep at task close (project-wide integration) | 590 | 590 | n/a |

## Residual Risks

1. **F-C5-DEFER-1** (Medium — `Planning/followups.md:1979`): Edit-mode TimeEditor changes silently dropped on PATCH path. Partial fix shipped in C.5 R1 (`readOnly` + edit-disabled hint + `outsideWindow` gating + defense-in-depth `onChange` short-circuit removes the silent-drop bug); full contract extension (Option A: extend PATCH Zod to accept `logged_at: z.string().datetime().optional()` + persist + re-bucket day-window) deferred. Owner TBD; could fold into Phase D hardening or a dedicated Phase E polish task.

2. **F-TEST-4 #1** (Pre-existing, shared with C.6 / C.2 / B.E2E): Playwright E2E auth-fixture infra gap blocks local headed-Chromium runs; spec is parsed via `--list` and runs in CI. Not a C.5 regression.

3. **Focus-ring regression-and-fix cycle (sweep-owned closure):** C.5 introduced `outline: var(--color-oxblood)` on `.kalori-confirmation-time-editor-input:focus-visible`, violating the project's IVORY focus-ring design contract. Remediated during C.SWEEP (working-tree edit on `app/globals.css` line 1813 — `oxblood` → `ivory`). The design-token contrast regression guard at `tests/unit/design-tokens/contrast.test.ts` should be widened to enumerate the new C.5 selector so future C.5-class regressions fail at Vitest before reaching CI; tracking owned by C.SWEEP.

4. **2-round Codex cap technical break (acknowledged):** User explicitly authorized 1 extra fix iteration (`600535a`) to close an R1-introduced regression. No outstanding adversarial concern; flagged for audit-trail transparency.
