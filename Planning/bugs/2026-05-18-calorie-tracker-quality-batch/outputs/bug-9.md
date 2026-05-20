# Bug 9: Food row layout and approximate grams

## Status
implemented

## Files Touched
- `app/(app)/log/_components/ConfirmationScreen.tsx`
- `app/globals.css`
- `lib/ai/portion-sanity.ts`
- `lib/ai/prompts.ts`
- `tests/unit/components/log-flow/ConfirmationScreen.test.tsx`
- `tests/unit/ai/portion-sanity.test.ts`
- `tests/unit/lib/ai/prompts-approx-grams.test.ts`

## Tests Added/Updated
- `tests/unit/components/log-flow/ConfirmationScreen.test.tsx::shows approximate grams below the food name only for confident sane non-gram rows`
- `tests/unit/ai/portion-sanity.test.ts` approximate gram repair/strip coverage.
- `tests/unit/lib/ai/prompts-approx-grams.test.ts` edible/plausible/omit-when-uncertain prompt coverage.

## Verification
- `pnpm vitest run --pool threads --maxWorkers 1 tests/components/log-flow/SnapTab.test.tsx tests/unit/components/log-flow/ConfirmationScreen.test.tsx tests/unit/api/entries-save.test.ts tests/unit/ai/portion-sanity.test.ts tests/unit/lib/ai/prompts-approx-grams.test.ts` passed.

## Notes
Approximate grams now render below the food name only for non-gram rows with confidence at least 0.75 and sane 5-2000g estimates. The row delete button remains row-scoped on the food-name line. Portion sanity now strips implausible `approxGrams` and populates conservative values when repairing impossible tiny gram portions into non-gram units.
