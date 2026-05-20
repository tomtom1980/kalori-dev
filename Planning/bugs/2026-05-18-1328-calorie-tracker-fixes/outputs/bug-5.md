# Bug 5 Output: AI-provided approximate grams for new parsed items

## Files Changed
- `lib/ai/schemas.ts`
- `lib/ai/prompts.ts`
- `app/api/entries/save/route.ts`
- `lib/library/create-schema.ts`
- `lib/library/fetch.ts`
- `lib/library/to-log-library-item.ts`
- `lib/stores/useLogFlowStore.ts`
- `app/(app)/log/_components/ConfirmationScreen.tsx`
- `app/(app)/log/_components/AddFoodTab/LibraryList.tsx`
- `app/(app)/library/_components/LibraryCard.tsx`
- `app/(app)/library/_components/FoodDetail/FoodDetailName.tsx`
- `app/(app)/library/_components/FoodDetail/foodDetail.schema.ts`
- `app/(app)/library/_components/FoodDetail/useFoodDetailEdit.ts`
- `app/api/library/[id]/update/route.ts`
- `app/api/library/merge/route.ts`
- `lib/i18n/en.ts`

## Tests Added / Modified
- `tests/unit/lib/ai/schemas-cholesterol.test.ts`
- `tests/unit/lib/ai/prompts-approx-grams.test.ts`
- `tests/unit/lib/library/create-schema.test.ts`
- `tests/unit/library/to-log-library-item.test.ts`
- `tests/components/library-tab-continue-cta.test.tsx`
- `tests/components/library/LibraryCard.test.tsx`
- `tests/components/library/FoodDetail.mode-edit-query.test.tsx`

## Commands Run
- RED: targeted Vitest command failed as expected. Bug 5 failures included `approxGrams` being stripped by AI schema, prompts lacking `approxGrams`, create schema rejecting the new nutrition metadata, mapper/display surfaces omitting `approx. 420 g`, and library re-log not scaling the metadata.
- PASS: targeted Vitest command -> 11 files / 165 tests passed.
- PASS: `pnpm typecheck`.
- PASS: `pnpm lint` with 40 pre-existing warnings, 0 errors.

## Implementation Notes
- Gemini text/vision prompts now request `approxGrams` for non-gram serving units; no local food conversion table was added.
- `ParsedItem` and save/create/update/merge schemas accept optional positive finite `approxGrams`.
- New parsed/logged items persist the metadata in entry items and library `nutrition.approxGrams`.
- Confirmation, library card, and Food Detail display subtle `approx. N g` text; library re-log scales it with the serving ratio.
- Historical rows without `approxGrams` are untouched.

## Residual Risk
- Accuracy depends on the model-provided estimate. The app validates/preserves/displays the value but does not independently verify food-specific gram equivalents.
