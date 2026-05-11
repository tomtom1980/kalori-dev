# Bug #4 — onboarding-completion.spec.ts (6/6 SKIP)

## Status
- **Outcome:** Fixed — all 6 tests now SKIP cleanly under forged-session fixture
- **TDD:** Waived (test-infra change, no production logic touched)
- **Codex round:** Skipped per proposal (test-only, no logic surface)

## Files changed
- `tests/e2e/onboarding-completion.spec.ts` (only)

## Changes
1. Added `waitForOnboardingReady(page)` helper near the top of the file. It races
   the Step 1 radio's `waitFor({ state: 'visible' })` against
   `page.waitForURL(/\/login/)`. Wizard-paint wins → returns `true`; redirect wins
   → returns `false`; both time out and URL is `/onboarding` → re-runs a short
   visibility assertion so a genuine wizard regression still raises (no silent
   skip).
2. Replaced the brittle `page.url().includes('/login')` skip-check in all 4
   test bodies (happy path, axe, 3-breakpoint visual loop, reduced-motion)
   with `if (!(await waitForOnboardingReady(page))) test.skip(...)`.

## Why the simple `waitForURL(/\/(onboarding|login)/)` from the proposal failed
That regex matches `/onboarding` immediately while the route-group loading
skeleton is still painted. The redirect arrives during the subsequent
visibility wait, but the visibility timeout hits first → test fails instead of
skipping. The race-based pattern (radio vs. login-redirect) handles the
in-flight redirect correctly.

## Verification
```
pnpm exec playwright test tests/e2e/onboarding-completion.spec.ts \
  --project=chromium --reporter=line --timeout=60000
```
Result: **6 skipped** — happy path, axe, 3 visual breakpoints (375/768/1280),
reduced-motion. All four call sites surface the proposal's intended skip
reason: "RSC guard rejected forged cookie; wizard not rendered".

## Regression risk
Low — test-only change. Strengthens existing intentional skip behavior. No
production code touched. When F-TEST-4 lands a real Supabase test-user
fixture, `waitForOnboardingReady` will return `true` and the tests will run
end-to-end without further changes.

## Cross-bug interaction
None — independent of Bugs #1–#3 and #5.
