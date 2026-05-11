# Fix R3 — combined (C2 + I3)

## Findings addressed
- C2 (Critical): stale `loggedOn` after midnight crossing — FAB writes durable wrong-day entries when a long-lived NavShell crosses local midnight. Fix: drill `timezone: string` instead of precomputed `loggedOn`; compute `userTzToday(timezone)` AT TAP TIME inside `handleLogWater`.
- I3 (Critical/Improvement): e2e fixture (`tests/e2e/fixtures/auth.ts`, commit `aea1a66`) is the real-Supabase F-TEST-4 #1 fixture, NOT a delegator to the forged-cookie helper. Earlier I2 sub-agent misread it. Un-skip the 3 water-FAB e2e+visual tests; clean up the now-stale `F-WATER-FAB-E2E-COVERAGE-GAP-2026-05-08` followup; log the parallel pre-existing chip bug as a NEW followup.

## C2 changes
- `components/nav/nav-shell.tsx`:
  - Replaced `loggedOn?: string` prop with `timezone?: string` (default `'UTC'`).
  - Removed UTC fallback ladder (`loggedOn ?? new Date().toISOString().slice(0, 10)`); replaced with `const today = userTzToday(timezone);` inside `handleLogWater`, computed AT TAP TIME.
  - Added `import { userTzToday } from '@/lib/time/day';` (verified client-safe — uses `Intl.DateTimeFormat`, `lib/time/day.ts:33`).
  - Comment block updated to call out the persistence-of-NavShell rationale and why a precomputed prop is forbidden.
- `app/(app)/layout.tsx`:
  - Removed `import { userTzToday } from '@/lib/time/day';` (no longer invoked here).
  - Removed `const loggedOn = userTzToday(timezone);` line (was at line ~95).
  - Changed `<NavShell userId={userId} identity={identity} loggedOn={loggedOn}>` → `<NavShell userId={userId} identity={identity} timezone={timezone}>`.
  - Preserved C1 fix (Sentry capture on profile lookup error, `.eq('id', user.id)` correction) — no regression.

## C2 tests
- `tests/components/nav/nav-shell.test.tsx`:
  - Added `userTzTodayMock` for `@/lib/time/day` so per-test setup can pin its return value AND advance "today" between render and tap to prove tap-time recomputation.
  - Updated all 6 existing FAB tests to render with `<NavShell timezone="UTC">` instead of `<NavShell loggedOn="2026-05-08">`. The default mock returns `'2026-05-08'`, so payload assertions are unchanged.
  - **NEW failing-then-passing test** at lines ~318-348: `'computes loggedOn at tap time using current timezone (does not use stale render-time value)'`. Renders with `timezone="Asia/Ho_Chi_Minh"` and `userTzTodayMock` set to `'2026-05-08'`; before tap, mock is updated to `'2026-05-09'`. Asserts:
    - `body.logged_on === '2026-05-09'` (post-midnight value, NOT the render-time '2026-05-08').
    - `userTzTodayMock` was called with `'Asia/Ho_Chi_Minh'` (proves the timezone prop is threaded into the helper, not a stale string).
- `tests/unit/app/layout-timezone-derivation.test.ts`:
  - Replaced two regression sentinels:
    - OLD: `'still derives loggedOn via userTzToday(timezone)'` + `'still forwards loggedOn to NavShell as a prop'`.
    - NEW: `'forwards timezone to NavShell so the FAB can compute logged_on at tap time (Codex R2 C2)'` (asserts `timezone={timezone}`), `'does NOT drill a precomputed loggedOn prop to NavShell (Codex R2 C2 regression guard)'`, `'does NOT import userTzToday at render time'`, and `'does NOT invoke userTzToday in code (regression guard for server-side derivation)'`.
  - All other layout-source assertions (column-name fix, Sentry capture, error destructure, UTC fallback) preserved unchanged.

## C2 verification
- `pnpm vitest run tests/components/nav/nav-shell.test.tsx tests/unit/app/layout-timezone-derivation.test.ts --reporter=verbose`:
  - **RED phase**: `× computes loggedOn at tap time using current timezone (does not use stale render-time value)` failed exactly as expected — `expected logged_on '2026-05-09' but received '2026-05-08'`. Confirms the test fails for the right reason (current code reading stale `loggedOn` prop).
  - **GREEN phase**: `Tests 27 passed (27)` across both files. Includes 16 nav-shell tests + 11 layout-timezone-derivation tests. New tap-time recomputation test passes; all regression guards (no `loggedOn=` on NavShell, no `userTzToday()` invocation in layout) pass.

## I3 changes
- `tests/e2e/nav-responsive.spec.ts`:
  - Added `import { test as authedTest } from './fixtures/auth';` at the top with explanatory comment about the misread that produced the original `.skip`.
  - Removed the conditional `if (viewport.label === 'mobile') { test.skip(...) }` block from inside the per-viewport for-loop.
  - Added a new `authedTest.describe('nav shell · mobile water FAB (authed real-browser)', () => { ... })` block AFTER the for-loop. The new block sets viewport via `authedTest.use({ viewport: { width: 375, height: 667 } })` and runs the canonical real-browser test using `authedPage` (real Supabase user). The test logic (waitForResponse → click → assert payload + toast + route preservation) is preserved verbatim.
- `tests/visual/water-fab-toast.spec.ts`:
  - Removed both `test.skip` annotations (default + reduced-motion).
  - Updated header doc: replaced the I2 deferral block with a Codex Round 2→3 explanation that the fixture is real-Supabase (not forged-cookie), so un-skipping is feasible.
  - Replaced both `tap()` calls with `click()` because the visual-baseline browser projects don't enable `hasTouch: true` (the e2e mobile project does, but visual projects use a different config). The `onClick` handler path is the relevant code under test; click and tap dispatch through the same React handler.

## I3 tests run
- `npx playwright test tests/e2e/nav-responsive.spec.ts -g "water FAB" --reporter=list` (chromium project): **1 passed (11.0s)**. Real Supabase user provisioned, signed in, FAB tap on `/library` POSTed to `/api/water/log`, toast surfaced, route preserved.
- `npx playwright test tests/visual/water-fab-toast.spec.ts --project=visual-baseline-chromium --reporter=list`: **2 failures BUT only because baselines are missing** ("A snapshot doesn't exist at ...") — the test logic ran cleanly, screenshots were captured, and Playwright wrote actuals. This is the EXPECTED outcome on first run per the dispatch instruction ("first run will produce baselines. If baselines are missing → expected; the visual snapshots will land at Phase 7"). The Linux baselines bootstrap via the F-TEST-1 `--update-snapshots=missing` workflow.
- Re-verified e2e water-FAB after the visual `tap()`→`click()` fix: still **1 passed (6.7s)**.
- Env-var requirement note: the runs above passed locally because `.env.local` (or equivalent) supplies `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` + `SUPABASE_SECRET_KEY` (the fixture's local-fallback path). For CI, the `SUPABASE_TEST_URL`, `SUPABASE_TEST_ANON_KEY`, `SUPABASE_TEST_SERVICE_ROLE_KEY` env vars must be present.

## Followups cleanup
- **Deleted** the `F-WATER-FAB-E2E-COVERAGE-GAP-2026-05-08` block from `Planning/followups.md` (lines 12-37 in pre-edit version). Its premise — that un-skipping was infeasible until F-TEST-4 #1 lands — was based on the misread of `tests/e2e/fixtures/auth.ts` as a forged-cookie delegator. The fixture is in fact the F-TEST-4 #1 implementation (shipped commit `aea1a66`), so the deferral was never necessary. The 3 tests are now un-skipped and exercising real-browser coverage.
- **Added** `F-WATER-CHIP-STALE-LOGGEDON-2026-05-09` block in the same section. Captures the parallel pre-existing bug in `components/dashboard/WaterTracker.tsx` (chip uses the same stale-`loggedOn` prop pattern), with severity Critical, owner TBD, estimate 30-60 min, and recommended fix (apply same `timezone` drill pattern OR refactor `logged_on` derivation server-side into `/api/water/log` route).

## Pre-existing chip bug noted
WaterTracker chip on dashboard has the same stale `loggedOn` bug; logged as a NEW followup `F-WATER-CHIP-STALE-LOGGEDON-2026-05-09` in `Planning/followups.md`.

## False-positive flags
- C2: false_positive: false (Codex was right; the stale-prop bug is a real durable-wrong-day failure mode for long-lived sessions across midnight).
- I3: false_positive: false (Codex was right; I2 sub-agent misread `fixtures/auth.ts` as a delegator to `auth-session.ts` — verification confirmed it's the real F-TEST-4 #1 fixture).

## Status
implemented
