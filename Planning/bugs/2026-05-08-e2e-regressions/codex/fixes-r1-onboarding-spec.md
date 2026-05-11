# I1 fix — tests/e2e/onboarding-completion.spec.ts

## Approach chosen: combined (A + C + bonus B-passive)

Codex's recommendation ("gate on a real authenticated fixture F-TEST-4
before shipping") cannot be fully met because F-TEST-4 is an explicit
out-of-scope followup for this batch. We therefore mitigate the masking
risk three ways without introducing F-TEST-4:

- **A (warn-not-fail variant):** an `afterAll` hook tracks per-test
  outcomes (`pass` / `skip-login-redirect`) and emits a high-visibility
  stderr warning when ALL executed happy-path tests skip via the forged
  session redirect. We deliberately do NOT throw — that is the EXPECTED
  steady state today and a hard fail would render CI permanently red.
  When F-TEST-4 lands, this hook should be tightened to throw if
  `passes === 0`.
- **C (explicit skip annotation):** every `test.skip()` call now uses a
  shared `SKIP_REASON_FORGED_SESSION` constant that names F-TEST-4
  explicitly and points at the smoke test as the live canary. Future
  audits / triage can grep for it and immediately see the dependency.
- **B (passive smoke):** added a NEVER-skipping smoke test
  (`onboarding · auth guard smoke`) that exercises the OPPOSITE
  direction — an unauthenticated request to `/onboarding` MUST redirect
  to `/login`. This is the one true canary against auth-guard
  regressions in either direction; it requires no fixture and runs
  unconditionally.

The combined effect: an auth-guard regression that makes onboarding
unreachable for ALL users now triggers either (i) a stderr warning
visible in CI logs (Option A), or (ii) the smoke test failing if the
guard breaks in the OTHER direction (anyone-can-reach), without waiting
for F-TEST-4. We retain the pre-existing skip semantics for the four
happy-path specs because they remain blocked on F-TEST-4 by design.

## Change applied

`tests/e2e/onboarding-completion.spec.ts` (single file, surgical):

1. New module-level outcome counter (`onboardingOutcomes`,
   `recordOutcome`) and `SKIP_REASON_FORGED_SESSION` constant with a
   long-form mitigation comment block citing Codex I1 verbatim.
2. All 6 existing happy-path tests now call `recordOutcome('pass')` on
   green path and `recordOutcome('skip-login-redirect')` immediately
   before each `test.skip()`. Their skip messages now reference
   F-TEST-4 by name + point to the smoke test.
3. New `onboarding · auth guard smoke` describe block with one test
   that clears cookies and asserts `/onboarding` redirects to `/login`.
4. Module-level `test.afterAll` hook that counts outcomes and emits a
   formatted multi-line `console.warn` when `passes === 0 &&
   loginSkips === total`, with a TODO to harden post-F-TEST-4.

No production code touched (`app/`, `lib/`, `components/` untouched).

## Verification

`pnpm exec playwright test tests/e2e/onboarding-completion.spec.ts --project=chromium --reporter=line --timeout=60000`:

- 7 tests collected (6 pre-existing happy-path + 1 new smoke).
- **1 passed** (`onboarding · auth guard smoke › unauthenticated
  request to /onboarding redirects to /login`) — confirms the auth
  guard works under real conditions.
- 6 skipped via the forged-session redirect (expected pre-F-TEST-4).
- The Codex I1 audit warning fired in stderr, exactly once per worker
  that executed a happy-path test (Playwright 4-worker parallelism).
- `pnpm typecheck`: passes clean.

Final tally: `1 passed, 6 skipped` — green, as required.

## Notes

- The afterAll-hook warning is emitted per-Playwright-worker, not
  globally. With 4 parallel workers each running a subset of the 6
  happy-path tests, multiple warnings can appear. That's fine for the
  audit purpose — even a single worker reporting "all skipped" surfaces
  the signal.
- The smoke test is intentionally minimal (just asserts `/login`
  redirect). It does NOT validate the redirect query params (`?reason=
  session_expired&redirect_to=...`) because that surface is already
  exercised by `tests/e2e/auth-redirect.spec.ts` and overlapping
  coverage would violate the "Surgical" principle.
- Once F-TEST-4 lands, the recommended follow-up is:
  1. Drop the `recordOutcome` plumbing.
  2. Remove the warn-not-fail hook OR convert it to
     `expect(passes).toBeGreaterThan(0)` in afterAll.
  3. Replace forged-session calls in the 4 happy-path specs with the
     real authenticated fixture; remove the `waitForOnboardingReady`
     branching.
- A followups entry recommending the F-TEST-4 hardening above should
  be added by main agent (out of scope here).

