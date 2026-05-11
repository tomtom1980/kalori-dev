# Task 4.7 — Pre-Phase 5 Audit Report

**Date:** 2026-04-25
**Baseline commit:** `61564c1` (Phase 4 GATE CLOSED)
**Method:** exec-tomi orchestration, 7 parallel sub-agents
**Verdict:** **6 issues to fix before Phase 5 entry, ~4–6h effort.** Phase 4 is structurally complete and runtime-stable on the surface, but the external Codex review identified 6 real correctness issues in core flows (manual save, save-to-library, library tab, photo thumbnails, typecheck, dedup tombstones) that should be remediated before Phase 5's offline-replay layer is built on top of these paths.

---

## Executive Summary

| Stream | Verdict | Pre-Phase 5 fixes |
|---|---|---|
| State + continuation | GREEN | 0 |
| **Codex external findings** | **YELLOW** | **6** (down from 12 after triage + verification) |
| Followups.md review | GREEN | 0 hard blockers; 62 entries well-maintained; 2 items need user decision pre-prod-cut |
| PRD-vs-code review | GREEN | 0 (~93% spec coverage; remaining 7% is intentional Phase 5 scope) |
| Test sweep (unit + integration) | GREEN | 0 (1247/1247 pass) |
| E2E Playwright | GREEN | 0 blocking (1 known fixture issue, 1 favicon 404) |

**Bottom line:** Codex findings reveal what surface tests don't — silent runtime failures in core user-facing flows. The 6 must-fix items take ~half a day and unlock 4 advertised features (manual save, save-to-library, library re-log, photo thumbnails) plus restore CI green. Without them, Phase 5's offline outbox will queue writes that fail silently when they replay (B1 manual writes hit DB error, B2 save-to-library no-ops queue forever, D1 thumbnails silently drop).

---

## Audit Methodology

7 parallel sub-agents:

1. **State + continuation summary** — confirmed Phase 4 closed, Task 5.1 next, R1 contract intact
2. **Codex findings analysis** — read `bugs/codexfindings.txt`, triaged 12 findings into severity / disposition / effort
3. **Followups.md review** — initial pass mis-read file as empty due to paginated-read miss; re-read confirmed 631 lines / ~62 entries, well-maintained, 0 hard blockers
4. **PRD vs code review** — 22-feature spot-check against PRD / architecture / ui-design / design-doc
5. **Unit + integration test sweep** — `pnpm test` → 1247/1247 pass
6. **Playwright E2E** — 8 routes via Playwright MCP + offline suite cross-check
7. **Migration verification** — confirmed B3/B4 are false positives (columns + indexes exist in 0007 and 0005)

Total sub-agent token spend: ~530K. Sub-agent contexts garbage-collected on return; main agent context stayed lean for synthesis.

---

## Stream 1 — State & Continuation

- **Phase 4 GATE CLOSED** on `61564c1` (Task 4.6 sweep PASS).
- **Continuation file** (`Planning/continuation.md`) is fresh (~12 minutes old at audit start), points to **Task 5.1** as next executable.
- **Brainstorm state:** `artifacts_complete` / `execution_in_progress`, Complex tier, 7 artifacts.
- **Tasks 4.1–4.6 status:** all ✅ Completed in `progress.md`.
- **Active blockers:** none.

**Residual contracts intact:**
- **R1 (refresh-interceptor):** clean across 7 mutation consumers; Phase 5 mutation work (5.1 outbox flush, 5.2 cross-tab sign-out + export + delete) MUST NOT introduce local refresh shims.
- **I11 (replay idempotency):** owned by Task 5.1; TDD-first failing test required.
- **F10 (conflict resolution):** owned by Task 5.1; library = LWW, goal-weight = user confirm.

**Migration state:** all 11 migrations applied to `kalori-dev` only. `kalori-prod` cutover deferred to Task 5.4 final shippable gate (correct).

**Soft notice (non-blocking):** `NEXT_PUBLIC_KALORI_ENV` not yet populated in any Vercel scope. Until populated, dev/preview Sentry events tag as prod. Recommend addressing before Phase 5 PWA shakedown.

---

## Stream 2 — Codex Findings (the main story)

Codex was run separately by the user against the whole repo at end of Phase 4. Output saved to `bugs/codexfindings.txt`. The audit triaged 12 findings into the buckets below. Verification sub-agent (Stream 7) confirmed B3 and B4 are false positives.

### Critical (FIX_NOW) — 2 items

**B1 — Manual entries fail at DB level (schema/API mismatch)** | Effort: **S**
- **Files:** `app/api/entries/save/route.ts:56`, `supabase/migrations/0003_food_schema.sql:92`
- **Issue:** API Zod schema accepts `source: 'manual'` but `food_entries.source` CHECK constraint allows only `('text','photo','library')`. Manual fallback writes hit DB constraint error.
- **Why critical:** breaks the manual-entry resilience path when AI parsing fails. Silent data-write failure for users.
- **Fix:** new migration `0012_food_entries_manual_source.sql` adding `'manual'` to the CHECK constraint.

**B2 — "Save to library" silently no-ops** | Effort: **S**
- **Files:** `app/(app)/log/_components/ConfirmationScreen.tsx`, `app/api/entries/save/route.ts`
- **Issue:** server creates a library row only when `body.normalized_name` is present, but the confirmation screen never sends that field. The UI toggle appears to work but no library row is created.
- **Why critical:** core PRD feature ("automatically build personal food library") is broken end-to-end. Cascades into broken Library tab + re-log + dedup.
- **Fix:** server computes `normalized_name` from `items[0].name` when `save_to_library=true`; persist full nutrition row.

### High (FIX_NOW) — 1 item

**C1 — Library tab in log modal not wired to data** | Effort: **M**
- **Files:** `LogFlowTabs.tsx`, `LibraryTab.tsx`, `LogPageClient.tsx`, `FoodDetail` "Log this now"
- **Issue:** `<LibraryTab />` mounts with no props, defaults `items=[]`. Deep-link `/log?tab=library&item=<id>` seeds selection but never fetches the item or enters confirmation. "Log this now" from FoodDetail therefore opens an empty modal.
- **Fix:** server-side hydration of library items into the tab + "Continue" CTA that converts selection to `ParsedItemT[]`; for direct deep-link path, fetch item and skip to confirmation with `source: 'library'`.

### Medium (FIX_NOW) — 3 items

**B5 — Library dedup-check ignores tombstones** | `app/api/library/dedup-check/route.ts` | **S**
- Missing `.is('deleted_at', null)` filter. Deleted items resurface in dedup prompts. One-line fix; rides with B1's migration commit.

**D1 — Thumbnail upload size mismatch** | `SnapTab.tsx`, `lib/image/compress.ts`, `app/api/storage/thumbnail/route.ts` | **M**
- Client compresses once to 500 KB and posts the same blob to the 50 KB thumbnail route. Route rejects; failure swallowed.
- **Fix:** dual-output compression — vision blob ≤500 KB / 1600 px; thumbnail blob ≤50 KB / 320 px WebP.

**TC1 — Failing typecheck on main** | `tests/integration/library-merge-cache-error-surfacing.test.ts:86`, `tests/integration/weight-page-imperial-conversion.test.tsx:111` | **S**
- `sentryArgs` possibly undefined; `"metric"` passed where `"imperial"` expected. CI gate. Should be green before Phase 5.

### Verified false positives (WONT_FIX) — 2 items

**B3 — `food_library_items.deleted_at`** | **NOT_A_BUG**
- Codex inspected only baseline migration 0003. Column was added in `0007_library_tombstone.sql:41` with partial index `idx_food_library_items_deleted_at` (where `deleted_at IS NOT NULL`). Both column and tuned partial index are present.

**B4 — `ai_call_log.client_id`** | **NOT_A_BUG**
- Same root cause. Column was added in `0005_ai_call_log_idempotency.sql:23` with partial unique index `ai_call_log_user_client_unique_idx` (where `client_id IS NOT NULL`). I11 idempotency contract is wired correctly.

### Defer to Phase 5 — 1 item

**E1 — Login email focus outline** | inline `outline: 'none'` overrides global `:focus-visible`. **S**. Phase 5 a11y/polish scope.

### Defer to Followups — 2 items

**C2 — Library-source save allows missing `library_item_id`** | Zod refine. Data-quality nit; depends on C1 first.
**OS1 — Oversized modules** | `globals.css` (3,444 lines), `en.ts` (1,010), `progress.ts` (955), `ConfirmationScreen` (901), `WeightQuickAdd` (674). Post-MVP refactor.

### Won't Fix — 1 item

**A1 — `/settings` placeholder** | Page is labeled placeholder by design; PRD §3.10/3.13/3.14 are formally Phase 5 Task 5.2 scope.

### Codex stream summary

**6 must-fix before Phase 5** (B1, B2, C1, B5, D1, TC1) — total effort ~4–6h
- Aggregated by area: db 2 (B1 migration + B5 query) | api 1 (B2) | ui 2 (C1, D1) | tests 1 (TC1)

---

## Stream 3 — Followups.md Review (CORRECTED — re-read after initial paginated-read miss)

`Planning/followups.md` is **631 lines / ~88 KB / ~62 entries**, well-maintained with chronological sections per phase close-out and consistent retirement markers. Initial sub-agent reported the file as empty — that was a paginated-read miss (file requires multiple Read calls to cover end-to-end). Corrected re-read produced this picture:

**Status counts:** Open: ~52 | Resolved/Retired: 6 | Disputed (audit-only): 1
**By area:** test ~14 | UI/UX ~30 | AI/security ~5 | infra/perf ~7 | doc ~3 | impl/other ~3

### Pre-Phase 5 BLOCKERS from followups: ZERO

Every Open entry is explicitly Minor / Improvement / Suggestion with documented "Do NOT do now" rationale. The closest blocker candidates were evaluated and dismissed:
- **F-TASK-4.2-TOCTOU** — Codex itself rated "low priority, low exploitability"; display-only orphan, not a security boundary break
- **F-TASK-4.2-C1-SCOPE-CROSS** — underlying vulnerability already fixed in Task 4.2 R1; entry tracks only the architectural revisit decision
- **F-UI-3.7-SCHEMA-DRIFT-GUARD** — Medium severity but Phase 4 shipped 6 new queries without regression; preventive, not remedial

### Phase 5 OVERLAP — 22 items (~30–50h aggregate, mostly absorbed by Task 5.1)

Highest-leverage cluster: **F-TEST-4 + 4 Phase 4 testing-sweep items + F-UI-3.5-1/2/3** (dashboard E2E gates) all gate on a single ~1–2h Supabase Admin API real-test-user seeding helper. **Landing F-TEST-4 first in Phase 5 unblocks 7+ downstream test entries with one effort.**

Other significant overlap clusters:
- **Task 5.1 a11y + reduced-motion + Lighthouse pass** absorbs ~10 entries: F-UI-3.5-7/8/14, F-UI-3.5-13, F-UI-4.3a-LCC-2D-NAV / CHART-BAR-NAV, F-UI-4.3b-CHART-TOOLTIP / ARROW-NAV / TOAST-SWIPE-ESC, F-UI-3.5-6 Masthead offline variant
- **Task 5.1 cache-strategy pass** absorbs F-UI-3.5-10 (cacheComponents migration, ~3–8h sizable refactor)
- **Task 5.1 AI hardening** absorbs F-AI-1/2/3 (vision 413 byte-size heuristic, sanitizeFields helper, homoglyph fold extension)
- **Task 5.2 account-delete cascade** absorbs F-IMPL-1 (admin-import opt-out for the delete route — touches I9)
- **Task 5.0/5.1 CI hardening** could absorb F-UI-3.7-SCHEMA-DRIFT-GUARD (preventive schema-introspection job) and F-DEP-1 (Node 20 deprecation 2026-09-16)

### Defer (post-MVP) — ~30 items

UI polish, doc cleanup, niche edge cases, perf optimizations. None gate Phase 5.

### Stale (cleanup-eligible but recommend keeping) — 7 items

F-SEC-1, F-TEST-2, F-TEST-3, F-UI-3.4-7, F-UI-3.7-COPY-YESTERDAY-REFRESH, F-TASK-4.2-M1-DELETE-SHAPE, F-UI-3.6-A-6 — all resolved or audit-only. Recommend keeping as audit/decision/PII-scrub history.

### Continuation cross-check — ALL 4 items present in followups.md

| Continuation item | Entry in followups.md |
| F-TEST-4 weight-log auth fixture | F-TEST-4 (line 244) + Phase 4 Testing Sweep #1 (line 10) |
| Lighthouse measures login-redirect proxy | Phase 4 Testing Sweep #2 (line 11) |
| `library-keyboard-nav.spec.ts` parallel flake | Phase 4 Testing Sweep #3 (line 12) |
| Lighthouse Windows EPERM | Phase 4 Testing Sweep #4 (line 13) |

**No process gap.** The earlier audit's "backfill needed" recommendation is withdrawn — the central log is consistent with continuation. The followups log is in good health and properly maintained per task close-out.

### Items needing USER DECISION before Phase 5 prod cut

1. **F-UI-3.6-A-4 — vn-smoke runtime fallback (touches I7 invariant)** — Two paths: (a) reword the doc to remove the "runtime fallback chain" claim (~10 min, no code change), or (b) implement a 2–4h runtime fallback spike. Phase 5 prod cut deadline gates this decision.
2. **F-UI-3.6-B-1-LIBRARY-CTA** — Was on Phase 3 close list. Largely satisfied by Task 4.2 deep-link, but no first-class "LOG SELECTED" CTA. **Likely closed naturally by Codex C1 fix** (library tab wiring includes a Continue/Log CTA per audit recommendation). Confirm during Codex C1 implementation.

### Invariant references

- **F-IMPL-1** → I9 (account-deletion cascade) — Task 5.2 load-bearing
- **F-UI-3.6-A-4** → I7 (vn-smoke fallback) — needs user decision
- **F-UI-3.5-10** → F10 / cacheComponents architecture — Task 5.1 sizable refactor
- **F-TASK-4.2-C1-SCOPE-CROSS** → I11 (idempotency on `/api/entries/save`) — Phase 5 security audit revisit
- **R1 refresh-interceptor** → DISPUTED in F-UI-3.6-A-6 (clarification only); R1 is browser-origin-cookie scope only — Phase 5 should not re-litigate

---

## Stream 4 — PRD vs Code Review

22-item feature audit against PRD / architecture / ui-design / design-doc. Highlights:

- **All 14 PRD features (§3.1–3.14)** implemented through Phase 4, except settings UI surface.
- **All 8 spec tables present** with correct RLS (4-verb policies on all 7 user-owned tables + storage bucket).
- **All 12 invariants (I1–I12)** wired with explicit module-header references.
- **All 4 ESLint invariant rules** active (`no-gemini-leak`, `no-admin-in-app`, `no-inline-cache-tags`, `no-inline-user-strings`).
- **All 5 Ledger design tokens** verified in `globals.css`.
- **Settings page is intentionally a stub** — PRD §3.10/3.13/3.14 are formally Phase 5 Task 5.2.

**0 critical structural gaps.** Spec coverage estimated at ~93% of Phase 1–4 scope. Remaining 7% is settings UI, Phase 5 by design.

**Important caveat:** this stream looked at *presence* of features (does X exist?). The Codex stream looked at *correctness* of features (does X work?). PASS in this stream does not imply PASS in Codex — and the 6 Codex must-fix items are mostly under features that this stream marked PASS. **Lesson: structural and correctness audits answer different questions; both are needed.**

---

## Stream 5 — Test Sweep

- **Runner:** Vitest 4.1.4 (happy-dom, threads pool, maxWorkers 1)
- **Result:** **1247/1247 PASS** in ~5 min wall time
- **Skipped:** ~13 suites use conditional `describe.skip` gated on `SUPABASE_TEST_*` env (CI-only, by design)
- **Coverage:** not collected (instrumentation overhead would push runtime past 8 min); deferred to a deeper sweep
- **Verdict:** GREEN. No failures, no flakes, no env issues.

**Caveat:** the **TC1 typecheck failures** Codex flagged are not in the Vitest run path — they're TypeScript compile errors that would surface during `tsc --noEmit` or CI typecheck, not during `pnpm test`. Stream 5 (`pnpm test`) and Codex's TC1 finding are looking at different gates. Both are real signals — `pnpm test` says runtime green; TC1 says CI typecheck red.

---

## Stream 6 — E2E Playwright

- **Live MCP browsing (8 routes):** all render without JS errors. Auth middleware enforces redirects correctly (307 → `/login?redirect_to=<path>`).
- **Theme verification:** computed styles confirm oxblood `#8A2A1F`, ivory `#F4EBDC`, warm-black `#0E0A08` rendered verbatim on login page.
- **Auth-bypass blocked** for live MCP — server-side `getUser()` validation (Task 2.1 C1-B fix) rejects forged tokens. This is a *feature*, not a bug. Authenticated flows are covered by the offline Playwright suite via real Supabase test-user seeding.
- **Existing Playwright suite:** 27 pass / 1 fail / 27 skip (skips are deferred fixture work).
  - **Failure:** `weight-log.spec.ts` uses bare `test()` instead of `authedTest`; `page.goto('/weight')` lands on `/login`. Known F-TEST-4 issue.
- **Cosmetic issues:**
  - `favicon.ico` 404 on every page (no `app/icon.tsx` shipped)
  - Next.js 16.2 deprecation: "The 'middleware' file convention is deprecated. Please use 'proxy' instead."

Screenshots saved to `tests/screenshots/audit-2026-04-25/`.

---

## Recommended Pre-Phase 5 Fix Plan

### MUST FIX (6 items, ~4–6h) — order recommended

1. **TC1 typecheck fixes** (S) — restore CI green so all subsequent commits gate cleanly
2. **B1 + B5 schema migration** (S+S, batch as `0012_food_entries_manual_source.sql`) — adds `'manual'` to `food_entries.source` CHECK constraint AND patches dedup-check route's tombstone filter in same commit
3. **B2 save-to-library server fix** (S) — compute `normalized_name` from `items[0].name`, persist full nutrition row
4. **C1 library tab wiring** (M) — hydrate items, "Continue" CTA, deep-link path → confirmation with `source: 'library'`
5. **D1 thumbnail dual-output** (M) — split compression: vision blob ≤500 KB / 1600 px; thumbnail blob ≤50 KB / 320 px WebP

Each fix should be **TDD-first** (failing test → minimal code → green) per project testing policy. Run **Codex re-review** on the aggregate diff before closing Task 4.7.

### Strongly Recommended (cheap wins, optional)

- **Populate `NEXT_PUBLIC_KALORI_ENV`** in Vercel scopes (un-break Sentry env tagging before Phase 5 PWA shakedown)
- **Add `app/icon.tsx`** or `app/favicon.ico` (silence 404s)
- **Switch `weight-log.spec.ts` to `authedTest`** fixture (one-line change; reduces F-TEST-4 cluster scope)

### Defer to Phase 5

- **E1** login focus outline (Phase 5 a11y/polish)
- **Middleware → proxy migration** (Next.js 16.2 deprecation; cosmetic for now)

### Defer to Followups

- **C2** library_item_id Zod refine (depends on C1)
- **OS1** oversized modules (post-MVP refactor)

### Won't Fix

- **A1** `/settings` placeholder (intentional Phase 5 Task 5.2 scope)
- **B3** `deleted_at` (NOT_A_BUG; verified in migration 0007)
- **B4** `client_id` (NOT_A_BUG; verified in migration 0005)

---

## Discussion Points

1. **Approve the 6-item Codex must-fix plan?** Total effort ~4–6h. If yes, I'll create sub-tasks 4.7.1–4.7.5 with TDD-first contracts and execute via fix sub-agents. Codex re-review on aggregate diff before closing.

2. **Decide on F-UI-3.6-A-4 (I7 vn-smoke fallback) — pre-prod-cut required:**
   - Path A: doc-reword (~10 min, no code change) — remove "runtime fallback chain" claim
   - Path B: implement runtime fallback spike (~2–4h)
   - This decision must land before Task 5.4 prod cut, but doesn't block Task 5.1 entry.

3. **F-UI-3.6-B-1-LIBRARY-CTA** — likely auto-closed by the Codex C1 fix (library tab wiring will include a "Continue" / "Log Selected" CTA). I'll confirm during C1 implementation. No separate decision needed unless C1 fix shape diverges.

4. **F-TEST-4 timing — recommend landing first in Task 5.1.** It unblocks ~7 downstream test entries (Phase 4 testing-sweep items + F-UI-3.5-1/2/3 dashboard E2E gates) with one ~1–2h effort. This is a Phase 5 task, not a 4.7 fix, but worth flagging now so it's prioritized at Phase 5 start.

5. **Optional cheap wins (~30min total) bundled into Task 4.7:**
   - Add `app/icon.tsx` to silence favicon 404
   - Switch `weight-log.spec.ts` to `authedTest` fixture (likely supersedes part of F-TEST-4 cluster)
   - **Withdrawn:** earlier audit recommended "backfill followups.md with continuation items" — that was based on incorrect read; all 4 continuation items are already in followups.md.

6. **Vercel `NEXT_PUBLIC_KALORI_ENV` population** — needs you to run `vercel env add` (I can't from Claude); not blocking but stale since 2026-04-23.

---

## Verdict

**Phase 4 → Phase 5 transition is gated on the 6 Codex must-fix items.** Without them, Phase 5's offline outbox will queue writes that fail silently when they replay. With them fixed, the foundation is solid for PWA + offline work.

The followups log is in good health (62 entries, 0 hard blockers, all open items either Phase 5 overlap or post-MVP defer). Two items need user decision pre-prod-cut (F-UI-3.6-A-4 doc-vs-spike, F-UI-3.6-B-1 likely auto-closed by C1).

Ready for your decision on the fix plan.
