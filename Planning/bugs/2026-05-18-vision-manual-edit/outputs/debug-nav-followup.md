# Nav full-suite follow-up

## Scope

Targeted test-only fix for the full-suite-only `tests/components/nav/nav-shell.test.tsx` water-FAB failure where `authPostMock` had extra calls from suite-order leakage.

## Root cause

The water-FAB tests asserted global `authPostMock` call counts and read `mock.calls[0]`. In full-suite order, unrelated async/mock residue can leave prior calls in that shared mock even though the nav file passes in isolation. The behavior under test is the call(s) caused by the specific water-FAB tap, so assertions should be scoped to a baseline captured immediately before that action.

## Change

- Added `beginWaterFabAction()` to clear local auth mock call history immediately before a water-FAB action while preserving the queued implementation for that action.
- Added `expectAuthPostCallsSince()` to assert only calls made after the captured baseline.
- Updated water-FAB POST payload, double-tap, in-flight suppression, and tap-time date tests to use baseline-scoped assertions.
- Preserved the error/cap toast assertions; no app source was changed.

## Changed paths

- `tests/components/nav/nav-shell.test.tsx`
- `Planning/.tmp/bugfix-2026-05-18-vision-manual-edit/outputs/debug-nav-followup.md`

## Verification

- `pnpm exec prettier --check tests/components/nav/nav-shell.test.tsx` passed.
- `pnpm vitest run tests/components/nav/nav-shell.test.tsx --reporter=verbose` passed: 30 tests.
- `pnpm test -- --reporter verbose` passed in the full-suite context.

Notes: full-suite output still includes existing Happy DOM teardown `AbortError` traces and Radix/test warnings, but Vitest exited successfully.

## Round 2 Critical Type Fix

- Fixed the `pnpm typecheck` blocker in `tests/components/nav/nav-shell.test.tsx` by replacing nested tuple destructuring from `expectAuthPostCallsSince(...)[0]` with an explicit non-null first-call tuple after the helper asserts the call count.
- Scope remains test-only; app source was not changed and water-FAB behavior assertions are preserved.
- Verification passed: `pnpm typecheck`.
- Verification passed: `pnpm vitest run tests/components/nav/nav-shell.test.tsx --reporter=verbose` with 30/30 tests passing.
