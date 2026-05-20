# Bug 8: AI parsed details must show micronutrients

## Status
implemented

## Files Touched
- `app/(app)/log/_components/ConfirmationScreen.tsx`
- `app/globals.css`
- `lib/i18n/en.ts`
- `tests/unit/components/log-flow/ConfirmationScreen.test.tsx`

## Tests Added/Updated
- `tests/unit/components/log-flow/ConfirmationScreen.test.tsx::standard parsed-food rows show only the top micronutrient by target percentage by default`
- `tests/unit/components/log-flow/ConfirmationScreen.test.tsx::standard parsed-food micronutrient toggle expands all nonzero micros and hides all-zero rows`

## Verification
- `pnpm vitest run --pool threads --maxWorkers 1 tests/components/log-flow/SnapTab.test.tsx tests/unit/components/log-flow/ConfirmationScreen.test.tsx tests/unit/api/entries-save.test.ts tests/unit/ai/portion-sanity.test.ts tests/unit/lib/ai/prompts-approx-grams.test.ts` passed.

## Notes
Standard text/photo confirmation rows now show the top nonzero canonical micronutrient by percent of target by default, with exact `Show all micronutrients` / `Hide all micronutrients` toggle copy. Library-only editable micronutrients remain separate.
