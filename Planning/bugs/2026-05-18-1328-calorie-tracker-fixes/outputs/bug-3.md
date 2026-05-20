# Bug 3 Output: AI parse details show micronutrients

## Files Changed
- `app/(app)/log/_components/WhyTheseNumbers.tsx`
- `app/(app)/log/_components/ConfirmationScreen.tsx`
- `lib/i18n/en.ts`

## Tests Added / Modified
- `tests/unit/components/log-flow/WhyTheseNumbers.test.tsx`

## Commands Run
- RED: targeted Vitest command failed as expected. Bug 3 failure: `why-these-numbers-top-micro` was absent because parsed item micros were not passed/rendered.
- PASS: targeted Vitest command -> 11 files / 165 tests passed.
- PASS: `pnpm typecheck`.
- PASS: `pnpm lint` with 40 pre-existing warnings, 0 errors.

## Implementation Notes
- `Confirmation.Reasoning` now passes current parsed items into `WhyTheseNumbers`.
- `WhyTheseNumbers` aggregates canonical micros, ranks by `% DV`, shows the top row in the minimal expanded details, and exposes a secondary expand/collapse button for remaining rows.
- Rows below 1% DV stay hidden via the existing shared display helper.

## Residual Risk
- Photo parse details still depend on a non-null reasoning payload; no adjacent photo-reasoning retrofit was included.
