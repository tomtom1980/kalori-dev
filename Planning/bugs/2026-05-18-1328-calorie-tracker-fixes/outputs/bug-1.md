# Bug 1 Output: Whole-style units integer-only

## Files Changed
- `lib/log/portion-unit.ts`
- `app/(app)/log/_components/ConfirmationScreen.tsx`
- `app/(app)/log/_components/AddFoodTab/LibraryList.tsx`
- `app/(app)/library/_components/FoodDetail/FoodDetailName.tsx`
- `app/(app)/library/_components/FoodDetail/useFoodDetailEdit.ts`
- `app/(app)/library/_components/FoodDetail/foodDetail.schema.ts`
- `app/api/entries/save/route.ts`
- `app/api/library/[id]/update/route.ts`
- `app/api/library/merge/route.ts`
- `lib/library/create-schema.ts`

## Tests Added / Modified
- `tests/unit/lib/log/portion-unit.test.ts`
- `tests/unit/lib/library/create-schema.test.ts`
- `tests/unit/library/food-detail-edit-validation.test.ts`
- `tests/unit/components/log-flow/ConfirmationScreen.test.tsx`
- `tests/components/library-tab-continue-cta.test.tsx`

## Commands Run
- RED: targeted Vitest command failed as expected: 11 files failed, 20 tests failed. Bug 1 failures included `isWholeStyleUnit is not a function`, cup still decimal-capable, decimal confirmation/library quantities accepted, and create/edit schemas accepting `1.5 cup`.
- PASS: `pnpm vitest run --pool threads --maxWorkers 1 tests/unit/lib/log/portion-unit.test.ts tests/unit/lib/library/create-schema.test.ts tests/unit/library/food-detail-edit-validation.test.ts tests/unit/lib/ai/schemas-cholesterol.test.ts tests/unit/components/log-flow/WhyTheseNumbers.test.tsx tests/unit/library/to-log-library-item.test.ts tests/components/library-tab-continue-cta.test.tsx tests/components/library/FoodDetail.mode-edit-query.test.tsx tests/components/library/LibraryCard.test.tsx tests/unit/components/log-flow/ConfirmationScreen.test.tsx tests/unit/lib/ai/prompts-approx-grams.test.ts` -> 11 files / 165 tests passed.
- PASS: `pnpm typecheck`.
- PASS: `pnpm lint` with 40 pre-existing warnings, 0 errors.

## Implementation Notes
- Replaced the old continuous-unit heuristic with shared `isWholeStyleUnit`, `isDiscreteUnit`, and `isWholeStyleQuantity`.
- `cup` / `cups` are now whole-style; gram/ml style units remain decimal-capable.
- Client controls reject positive decimal edits for whole-style units and use integer steps/input modes.
- Server and shared schemas reject direct decimal whole-style payloads.

## Residual Risk
- Existing persisted fractional whole-style rows are not retrofitted by scope. If opened, future edits/saves enforce the new integer rule.
