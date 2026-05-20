# Bug 4: Library custom serving scales macros but drops micronutrients

## Classification
known_fix

## Root Cause
The Add Food library selection path builds confirmation items in `LibraryList.tsx::buildParsedItemsFromSelection`. That mapper already computes `ratio = quantity / defaultPortion` and applies it to kcal and macros, but it hard-codes `micros: {}`. The production library hydration shape also drops `nutrition.micros` in `toLogLibraryItem`, so list-driven library re-log cannot carry vitamin C or other micronutrients into confirmation/save; the deep-link path in `LogPageClient` already scales micros correctly, which confirms the intended behavior.

## Proposed Change (Diff Outline)
- `lib/stores/useLogFlowStore.ts`
  - Add optional `micros?: Record<string, number>` to `LogLibraryItem` so hydrated library rows can carry micronutrients to the Add Food library list.
- `lib/library/to-log-library-item.ts`
  - Forward `item.nutrition.micros` into the returned `LogLibraryItem`, preserving sparse/legacy rows as `{}` or `undefined` consistently with existing patterns.
- `app/(app)/log/_components/AddFoodTab/LibraryList.tsx`
  - Add optional `micros` to the local backwards-compatible `LibraryItem` interface.
  - Add a small `scaleLibraryMicros` helper mirroring the existing kcal/macro ratio behavior.
  - Replace hard-coded `micros: {}` in `buildParsedItemsFromSelection` with scaled micros from the selected library item.
- `tests/unit/library/to-log-library-item.test.ts`
  - Assert `toLogLibraryItem` preserves library micros such as `vitamin_c`.
- `tests/components/library-tab-continue-cta.test.tsx`
  - Add/extend selection tests to assert a custom quantity scales micros by the same ratio as macros.

## Files Affected
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\stores\useLogFlowStore.ts`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\library\to-log-library-item.ts`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\log\_components\AddFoodTab\LibraryList.tsx`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\library\to-log-library-item.test.ts`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\library-tab-continue-cta.test.tsx`

## TDD Required
yes — this is logic/data-shape behavior affecting persisted food entry nutrition.

## Test Approach
- Add a RED test in `tests/components/library-tab-continue-cta.test.tsx` with a library item containing `defaultPortion: 100`, macros, and `micros: { vitamin_c: 80 }`; select it, change quantity to `50`, click `library-log-selected`, and assert confirmation payload has `micros.vitamin_c === 40` alongside scaled macros.
- Add/extend a mapper unit test in `tests/unit/library/to-log-library-item.test.ts` asserting `nutrition.micros` survives the `LibraryItem` to `LogLibraryItem` conversion.
- Run the focused test files first, then the relevant log-flow/library unit subset if time allows.

## Risk Assessment
low — change is additive to the library hydration shape and mirrors already-existing deep-link micros scaling behavior.

## Regression Sweep Needed
- Add Food library selection and `LOG SELECTED` confirmation payload.
- `/api/library/list` hydration consumers via `toLogLibraryItem`.
- ConfirmationScreen portion-edit scaling, because it already scales `item.micros` once the initial payload includes them.
- Dashboard micronutrient aggregation for entries created from library selection.

## UI Touching
true — component touched: `app/(app)/log/_components/AddFoodTab/LibraryList.tsx`. No visual, animation, or interaction change is proposed; existing mobile wheel-picker guidance from `planning/ui-design.md` tiebreaker #23 and `web-ui-guide.md` Quick-Pick table remains unchanged because the fix only changes the data carried by the existing control.

## Open Questions
None.
