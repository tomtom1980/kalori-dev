# Codex Round 1 — Categorized Findings

**Batch:** `2026-05-08-mobile-water-button`
**Scope:** Working-tree diff vs HEAD (water-FAB fix; 10 modified files + 2 untracked: `lib/water/client-id.ts`, `tests/visual/water-fab-toast.spec.ts`)
**Codex verdict:** `needs-attention` — no-ship until F1 (timezone) is fixed
**Auto-retry signals:** None detected (review is complete and authoritative)
**Round:** 1 of 2
**Round-1 raw output:** `Planning/.tmp/bugfix-2026-05-08-mobile-water-button/codex/round-1.md` (lines 70-90 are the verbatim review body)

---

## Critical (count: 1)

### C1 — Profile timezone lookup uses a non-existent column, so logged_on silently falls back to UTC

- **File / Line:** `app/(app)/layout.tsx:64-69`
- **Issue:** *(verbatim from Codex)*
  > The layout queries `profiles` with `.eq('user_id', user.id)`, but the profile schema uses `profiles.id` as the auth user key, not `user_id`. Because the Supabase error is ignored, `profileRow` stays null and `timezone` remains `UTC`. `NavShell` then posts that UTC-derived `loggedOn` to `/api/water/log`, where it is persisted as `water_log.date`. For users outside UTC, especially near midnight, the mobile water FAB can write a durable water entry to yesterday/tomorrow relative to the user's actual local day.
- **Recommended fix:** *(verbatim from Codex)*
  > Query by `.eq('id', user.id)` and fail closed on profile lookup errors instead of silently using UTC; preferably reuse the existing profile fence with `timezone` selected so missing/error states cannot produce a writeable fallback date.
- **Independent verification:** `Planning/architecture.md:143-144` declares `create table public.profiles (id uuid primary key references auth.users(id) ...)`. Every other code site queries by `.eq('id', user.id)`: `lib/auth/orphan-profile-fence.ts:156`, `app/(app)/onboarding/page.tsx:75`, `tests/_helpers/fence-mock.ts:8`. The layout's `.eq('user_id', user.id)` is the only outlier and **cannot match any row**. This is a confirmed data-integrity defect, not a theoretical concern.
- **Severity rationale:** Categorized **Critical** because it (a) writes durable data to the wrong calendar day for any non-UTC user near midnight, (b) has zero observable signal to the user (toast says success, dashboard tracker stays stale, server stores wrong `logged_on`), and (c) was missed by the unit-test surface (which injects `loggedOn` directly).

## Improvement (count: 2)

### I1 — FAB success path persists data but leaves the visible dashboard tracker stale

- **File / Line:** `components/nav/nav-shell.tsx:151-169`
- **Issue:** *(verbatim from Codex)*
  > After the POST succeeds, the handler only pushes a toast and announces success. It does not update a shared water state, call the `WaterTracker` optimistic reducer, or refresh the current route. On mobile dashboard, the FAB and the water tracker are visible in the same surface, so the user can receive `250 ml logged` while the bullets/ml total remain unchanged until a later navigation or refresh. That stale confirmation path makes duplicate taps and user confusion likely.
- **Recommended fix:** *(verbatim from Codex)*
  > Route the FAB through the same water mutation/state path as `WaterTracker`, or refresh/update the dashboard water data after success; add a dashboard-level test that asserts the visible tracker changes after tapping the FAB.
- **Severity rationale:** Categorized **Improvement** (not Critical) because the data is persisted correctly (modulo C1) and the user can refresh to see truth — but it is the focus area #4 the original brief flagged ("Other tabs / dashboard chip won't reflect the +250ml until next nav. Acceptable or a regression?"), and Codex's answer is unambiguously "regression." Duplicate-tap risk on a write endpoint is the concrete UX harm.

### I2 — Real browser coverage for the new FAB route is skipped

- **File / Line:** `tests/e2e/nav-responsive.spec.ts:225` (and `tests/visual/water-fab-toast.spec.ts`, both `test.skip`)
- **Issue:** *(verbatim from Codex)*
  > The added E2E and visual specs that exercise the actual mobile tap, network POST, route preservation, toast, and reduced-motion rendering are all `test.skip`. The unit tests inject `loggedOn` directly and mock `authPost`, so they cannot catch the broken RSC timezone query or any server/browser integration failure in the changed path.
- **Recommended fix:** *(verbatim from Codex)*
  > Unskip at least one authenticated E2E covering a non-UTC timezone and assert the posted `logged_on`; keep the visual/reduced-motion case gated separately only if necessary.
- **Severity rationale:** Categorized **Improvement** because the original brief openly flagged this as "execution deferred to that gate (C1-B real-test-user seeding), not this batch" — but Codex correctly notes that C1 (the timezone bug) would have been caught by exactly this E2E and is the canonical example of why deferring browser coverage on a write-path mutation is a real risk. The test files exist; flipping `.skip` is cheap if the auth fixture is reachable, but if the C1-B seed gate genuinely blocks it, this becomes a tracked followup rather than a same-batch fix.

## Minor (count: 0)

*(none — Codex's review was tightly scoped to the highest-impact failure modes per the focus areas in the prompt)*

---

## Auto-fix dispatch recommendation

- **C1** is mechanically fixable in a single-line change (`'user_id'` → `'id'`). Auto-fix sub-agent should also harden the error-fallback path per Codex recommendation: stop swallowing the Supabase error and decide whether to fail closed (don't render the FAB / null `loggedOn`) or to log + continue with a visible signal. **Auto-fix in round 2.**
- **I1** has two solutions of different size: (a) cheapest — add `router.refresh()` after success on the dashboard route, which forces an RSC re-render and pulls fresh water totals; (b) heaviest — co-locate FAB write through `useWaterTrackerStore` for in-memory optimistic update + cross-tab broadcast. The brief says "no optimistic state update in the FAB path. Acceptable or a regression?" so the right call is at minimum (a). **Auto-fix in round 2** with the lightweight `router.refresh()` approach unless main agent decides to defer.
- **I2** is a coverage/process concern. If the C1-B real-test-user seed gate is still blocking, this becomes a **tracked followup** in `Planning/followups.md` rather than a same-batch fix. Otherwise unskip the E2E and the timezone case becomes a regression test for C1. **Main agent decides.**

**Bottom line:** Critical + Improvement = 3, so main agent SHOULD dispatch auto-fix sub-agents (or defer I2 with a followup entry).
