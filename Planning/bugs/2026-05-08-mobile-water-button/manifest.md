# Bug Bundle Manifest — 2026-05-08-mobile-water-button

**Started:** 2026-05-08T16:33:08Z
**Committed:** 2026-05-09 (~01:33 GMT+7)
**Starting HEAD:** `bb539df3273929334cafe46d025dbd1f97f35d98`
**Branch:** main
**Codex rounds:** 3 (user-authorized override per HARD-RULE 4 two-round cap)
**Status:** completed (ready to ship)

**User decisions:**
- Phase 2 approval gate: bug approved as `known_fix` with multi-aspect implementation plan
- Phase 3 STW (TTL contract): **Option B** — carve `ttlMs?:number` override into `useUndoQueueStore` contract (user explicitly chose 2s feedback over canonical 5s)
- Phase 5 STW (Codex R2 cap): **Option 3** — HARD-RULE 4 override authorizing inline fix for C2 + I3 in this batch (instead of force-commit / abort+rollback)
- Phase 5.5 STW (R3 verification): user authorized verification round to confirm C2 + I3 fixes hold; R3 found 0 Critical, 2 Improvement deferred as followups

## Per-bug detail

### Bug #1 — Water FAB on mobile non-functional + missing 250 ml default + missing toast feedback

- **Status:** implemented
- **Classification:** known_fix (became multi-aspect after Codex rounds revealed three coupled defects)
- **Description:** The mobile water FAB introduced in the prior `2026-05-08-mobile-ui-overhaul` bundle (Bug #5) shipped with `onClick = () => router.push('/dashboard')` per the user's Path A decision. On the `/dashboard` route this is a same-route no-op, making the FAB appear dead from the user's most-frequent surface. Bundle resolves three coupled defects: (1) the same-route navigation no-op, (2) missing default-quantity (250 ml) logging surface from non-`/dashboard` routes, (3) no confirmation feedback to the user that the log succeeded.
- **Root cause (final, after Codex):** Three coupled defects merged via Codex review:
  - **Path A flaw:** FAB was wired as `router.push('/dashboard')` — same-route no-op on the `/dashboard` route.
  - **Codex R1 C1:** the new layout `profiles.timezone` SELECT was keyed by `.eq('user_id', user.id)` — `profiles.user_id` does not exist (canonical is `.eq('id', user.id)` per `Planning/architecture.md:143-144`); silent UTC fallback would log to wrong calendar day for non-UTC users.
  - **Codex R2 C2:** even after the C1 column rename, `loggedOn` was still computed at server-layout render time and captured as a stale prop in the persistent client `<NavShell>`. Long-lived sessions crossing local midnight would log to yesterday.
  - **Store contract gap:** `useUndoQueueStore.pushToast` hard-coded TTL at 5s with no per-call override, blocking the user-requested 2s confirmation.
- **Files touched:**
  - **Production:**
    - `components/nav/nav-shell.tsx` (Path A swap → direct POST + ref-latch + tap-time `userTzToday(timezone)` + canonical toast + `router.refresh()` on success)
    - `app/(app)/layout.tsx` (NEW `profiles.timezone` SELECT keyed by `id`; `Sentry.captureException` + UTC fallback on lookup error; threads `loggedOn` + `timezone` props into NavShell)
    - `lib/stores/useUndoQueueStore.ts` (Stage A — `ttlMs?:number` carved into contract; `selectLiveTop` honors per-entry value; broadcast envelope forwards it)
    - `lib/stores/useUndoQueueStore.cross-tab.ts` (receiver forwards `data.ttlMs` only when present)
    - `lib/water/client-id.ts` (NEW — `mintClientId()` promoted from `WaterTracker.tsx` for shared UUID-v4 fallback)
    - `components/dashboard/WaterTracker.tsx` (local `mintClientId` removed; imports from new shared module)
    - `lib/i18n/en.ts` (NEW `t.fab.waterLoggedToast` + `waterLoggedAnnounce` + `waterLoggedFailed`)
  - **Tests:**
    - `tests/unit/lib/stores/useUndoQueueStore.test.ts` (Stage A — 3 new it() blocks under `Bug-1 — pushToast ttlMs override`)
    - `tests/integration/lib/stores/useUndoQueueStore-cross-tab.test.ts` (Stage A — 2 new it() blocks: payload + reconstruction)
    - `tests/components/nav/nav-shell.test.tsx` (Stage B — replaced "Path A navigates to /dashboard" characterising test with 7 new it() blocks)
    - `tests/unit/app/layout-timezone-derivation.test.ts` (NEW — 11 source-shape assertions: C1 column rename + Sentry + C2 R3 timezone-drill sentinels)
    - `tests/e2e/nav-responsive.spec.ts` (water-FAB block migrated from `seedAuthSession` to real-Supabase `authedPage` fixture and un-skipped per I3 R3 fix)
    - `tests/visual/water-fab-toast.spec.ts` (NEW — 2 cases at 375×667: default + reduced-motion via `tap()`)
    - 4 NEW chromium PNG baselines (mobile + tablet × default + reduced-motion) under `tests/visual/__screenshots__/visual/water-fab-toast.spec.ts/`
- **Tests added (16 new + 1 file pinned):**
  - 3× `useUndoQueueStore.test.ts` — `ttlMs` override timer-fires-at-2s, omitted-defaults-to-5000 backward-compat, `selectLiveTop` honors per-entry value
  - 2× `useUndoQueueStore-cross-tab.test.ts` — `ttlMs` in broadcast payload, receiver reconstructs with that ttl
  - 7× `nav-shell.test.tsx` — POST payload (snake_case), success-side toast at `ttlMs:2000`, polite SR announce, POST-failure error toast, ref-latch single-fire, no `router.push` from `/library`, success-only `router.refresh()` (I1), tap-time `loggedOn` (C2 R3)
  - 1× `nav-shell.test.tsx` — superseded "Path A navigates to /dashboard" characterising test removed
  - 11× `tests/unit/app/layout-timezone-derivation.test.ts` (NEW file) — column-rename + Sentry-error-hardening + C2 R3 timezone-drill prop sentinels
  - 1× `tests/e2e/nav-responsive.spec.ts` — water-FAB authedPage block (un-skipped, real Supabase user mint)
  - 2× `tests/visual/water-fab-toast.spec.ts` — default + reduced-motion at 375×667
- **Codex findings:**
  - **R1:** 1 Critical (C1 — `.eq('user_id', user.id)` outlier; canonical column is `id` per `architecture.md:143-144`) + 2 Improvement (I1 — POST-success leaves dashboard tracker stale; I2 — e2e + visual `.skip` deferred). All 3 auto-fixed in Phase 5 Round 1: column rename + `Sentry.captureException` hardening; `router.refresh()` on POST success only; I2 initially deferred as Outcome B with followup, later flipped to round-3 fix per user override.
  - **R2:** 2 Critical (C2 — captured `loggedOn` prop stale across midnight in long-lived sessions; I3 — file-level e2e fixture migration claim contradicted by repo evidence — `tests/e2e/fixtures/auth.ts` exists with real Supabase fixture). Both auto-fixed in Phase 5 Round 2 via user-authorized HARD-RULE 4 override: timezone-prop drill from `app/(app)/layout.tsx` → `<NavShell timezone>` + `userTzToday(timezone)` recompute at tap time inside `handleLogWater`; nav-responsive water-FAB block migrated to `authedPage` fixture and un-skipped; visual spec un-skipped.
  - **R3 (verification, user-authorized):** 0 Critical, 2 Improvement (NEW-IMP-1 — file-level migration claim was overstated, only the new water-FAB block was migrated and 4 unrelated `nav-responsive.spec.ts` skip blocks remain on the forged `seedAuthSession` helper; NEW-IMP-2 — `authedPage` fixture seeds `profiles.timezone='UTC'` so the new e2e doesn't exercise the non-UTC C2 regression vector). Both deferred as followups per Codex's own recommendation. C2 + I3 round-2 fixes verified clean.
- **Risk:** medium

## Codex Round Summary
- **R1:** C1 + I1 + I2 → 3 file-scoped auto-fix sub-agents (layout column rename + Sentry; nav-shell `router.refresh()`; e2e+visual deferred initially)
- **R2:** C2 + I3 → escalated to user via STW (HARD-RULE 4 cap reached); user authorized inline-fix bypass (Option 3); both fixed via 2 sub-agents (timezone-prop drill; nav-responsive water-FAB migration to `authedPage`)
- **R3 (override):** verification round only — 0 Critical, 2 Improvement deferred as followups per Codex recommendation; C2 + I3 R2 fixes verified clean

## Security Review
0 Critical / 0 High / 2 Medium / 4 Informational. Recommendation: **PROCEED-CLEAN**.

- **M1 — `/api/water/log` no rate limit** (PRE-EXISTING, marginally amplified). FAB now reachable from every `(app)` route, not just `/dashboard`. RLS-bounded to attacker's own row set. Tracked as `F-WATER-LOG-RATE-LIMIT-2026-05-09`.
- **M2 — `logged_on` accepts any past/future date matching `YYYY-MM-DD`** (PRE-EXISTING since Task 3.5). RLS-bounded. Tracked as `F-WATER-LOG-LOGGED-ON-BOUNDS-2026-05-09`.
- **I1-info — `mintClientId` Math.random fallback** — not exploitable; per-user idempotency scope + UNIQUE constraint + 23505 race re-select renders collision risk moot. Modern browsers (>=2021) all support `crypto.randomUUID`.
- **I2-info — cross-tab `description` no length cap** — same-origin requirement; React `{}` interpolation prevents XSS. Hypothetical, gated on prior compromise.
- **I3-info — `ttlMs` no upper cap** — `setTimeout` clamps to ~24.85d; FIFO max-5 eviction neutralizes long-armed timers via `clearTimeout`.
- **I4-info — `userTzToday(tz)` accepts any string** — `Intl.DateTimeFormat` is not an injection sink; malformed values throw `RangeError` caught by `handleLogWater` → graceful "Could not log water" toast.

## E2E Phase 7
- **Strategy:** A modified — bake locally for chromium projects, defer cross-browser to CI workflow_dispatch (F-TEST-1) per project precedent (local Windows lacks Firefox + WebKit binaries)
- **Unit + integration:** 21 files / 157 tests / 0 failed (1.55s + 1.59s defensive sweep on dashboard regression)
- **E2E water-FAB (real Supabase `authedPage`):** 1/1 PASS in 7.2s — POST `/api/water/log` 200 → toast surfaces "250 ml logged" → no navigation off `/library`. I3 R3 un-skip verified working.
- **Visual baselines baked (4 NEW chromium PNGs, 44 328 B each, 375×667 RGB):**
  - `water-fab-toast-default-visual-baseline-chromium-mobile.png`
  - `water-fab-toast-default-visual-baseline-chromium-tablet.png`
  - `water-fab-toast-reduced-motion-visual-baseline-chromium-mobile.png`
  - `water-fab-toast-reduced-motion-visual-baseline-chromium-tablet.png`
- **Visual verification:** PNGs render correctly — mobile dashboard masthead "KALORI" + ChronometerRing + dual FABs (food primary oxblood + water secondary droplet) + "250 ml logged" toast above FABs + bottom tab bar with active "DASHBOARD" pill. Reduced-motion identical (motion suppression doesn't visually alter the static toast frame).
- **Adjacent visual regression:** `dual-fab-layout.spec.ts` 18/18 across 3 chromium projects clean. Geometric assertions pass — water FAB tap-handler swap did not regress the FAB's visibility / side-by-side / gutter / 56×56 sizing.
- **Cross-browser deferred:** Firefox + WebKit baselines pending CI `update_snapshots=true` workflow_dispatch (F-TEST-1) — consistent with project precedent.
- **Blockers encountered:** 0 (Firefox/WebKit "browser not installed" failures during local `--update-snapshots` are LOCAL infrastructure gaps, not test failures; CI's `playwright install --with-deps chromium firefox webkit` step covers them).

## Pending follow-ups (deferred — for user disposition)

- **`F-WATER-CHIP-STALE-LOGGEDON-2026-05-09`** (high, parallel pre-existing) — `WaterTracker` dashboard chip uses the same stale render-time `loggedOn` prop pattern that C2 R3 fixed for the FAB. Same wrong-day-after-midnight failure mode in `components/dashboard/WaterTracker.tsx`. Out of scope for this batch.
- **`F-WATER-LOG-RATE-LIMIT-2026-05-09`** (medium, pre-existing API risk) — `/api/water/log` has no per-user rate limit; FAB widens reachable surface from `/dashboard` to every `(app)` route. RLS bounds blast radius to attacker's own rows.
- **`F-WATER-LOG-LOGGED-ON-BOUNDS-2026-05-09`** (medium, pre-existing API risk) — server accepts any `YYYY-MM-DD` shape including 9999-12-31 / 0001-01-01. RLS-bounded.
- **`F-NAV-RESPONSIVE-PARTIAL-MIGRATION-2026-05-09`** (improvement, Codex R3 NEW-IMP-1) — the I3 file-level migration claim was overstated; 4 unrelated `nav-responsive.spec.ts` skip blocks (active-tab assertion, 44×44 tap targets, axe-core, visual baseline) still use the forged `seedAuthSession` helper. Either migrate to `authedPage` OR document why each remains skipped.
- **`F-WATER-FAB-NON-UTC-E2E-COVERAGE-2026-05-09`** (improvement, Codex R3 NEW-IMP-2) — `authedPage` fixture seeds `timezone:'UTC'`, so the new e2e doesn't exercise the non-UTC C2 regression vector. Unit-level coverage in `tests/unit/app/layout-timezone-derivation.test.ts` + `tests/components/nav/nav-shell.test.tsx` already pins the source contract; coverage gap, not a production defect. Resolution: extend fixture for per-test timezone override.
- **4 Informational findings from security review** — see `security-review.md` in this folder for I1–I4 details (mintClientId entropy, broadcast description length, ttlMs upper cap, userTzToday tz validation). All optional hardening, none required.
- **Firefox + WebKit visual baselines** for `water-fab-toast.spec.ts` — bake on next CI `update_snapshots=true` workflow_dispatch (F-TEST-1 mechanism).

## Deviations from initial proposal

- **Store contract widened to include `ttlMs?:number`** (user-approved Option B at Phase 3 STW; original proposal recommended Option A "accept 5s canonical TTL"). This added 4 files to Stage A: store + cross-tab listener + 2 test files.
- **`mintClientId` promoted to shared `lib/water/client-id.ts`** (within-scope sub-agent decision; proposal allowed either inline copy or shared module — chose shared so future bug-fix doesn't keep two helpers in sync).
- **`(app)/layout.tsx` profile timezone fetch** — proposal flagged as Open Question §2 with recommendation toward (a) prop-drill from layout. Implemented (a) with UTC fallback for unauthenticated/test renders.
- **`loggedOn` drilling pivoted to `timezone` drilling at C2 R3 fix** — original implementation captured `userTzToday(timezone)` once at server-layout render and drilled the result; C2 fix replaced this with drilling `timezone:string` and recomputing `userTzToday()` inside `handleLogWater` at tap time.
- **Skipped `tests/integration/water-log-from-fab.test.ts`** (proposal §Test Approach #3) — the 5 nav-shell unit tests + 2 store integration tests already cover the full wire (POST + toast + ttlMs broadcast). Adding a separate integration file would be redundant.

## R1 firewall preserved throughout

No edits to `lib/auth/refresh-interceptor.ts`, `lib/auth/cross-tab-signout.ts`, `lib/auth/authFetch.ts`, or `app/(app)/log/_components/ConfirmationScreen.tsx`. The new `app/(app)/layout.tsx` `profiles` SELECT is independent of the orphan-profile fence and uses the same canonical `.eq('id', user.id)` shape per `architecture.md`.

## Sub-artifacts (this folder)

- `proposals/bug-1.md` — Phase 1 investigation proposal
- `outputs/bug-1.md` — Phase 3 implementation output (incl. STW history)
- `codex/round-{1,2,3}.md` — verbatim Codex review outputs
- `codex/round-{1,2,3}-categorized.md` — categorized severity findings
- `codex/fixes-r1-{layout,nav-shell,tests}.md` — Round 1 fix sub-agent outputs
- `codex/fixes-r3-combined.md` — Round 3 fix sub-agent output
- `security-review.md` — Phase 6 security review (PROCEED-CLEAN)
- `e2e-results.md` — Phase 7 E2E + visual sweep results
- `project-context.md` — Phase 0 priming output
- `lessons-relevant.md` — Phase 0.5 lessons-learned curated context
