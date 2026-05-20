# Bug 9: Food row layout and approximate grams
## Classification
needs_debug_shallow

## Root Cause
`ConfirmationScreen` already renders `approxGrams` below the portion stepper, but the row grid uses five columns: section number, food name, portion controls, kcal field, and delete. This can still make the approximate gram line compete with the calorie line on narrower desktop/tablet widths and does not explicitly bind the delete `X` to the same food-name line. The display predicate only checks positive non-gram `approxGrams`; it does not consider parse confidence or sane edible bounds. Prompt and runtime sanity logic request `approxGrams`, but `portion-sanity.ts` repairs impossible tiny gram portions without adding/validating approximate grams for the repaired non-gram item.

## Proposed Change (Diff Outline)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\log\_components\ConfirmationScreen.tsx`
  - Adjust row markup/classes so the small `X` delete button stays on the same line as the food item name.
  - Move/anchor `approxGrams` visually below the food item/name area, not between portion and kcal in a way that breaks the calorie line.
  - Strengthen `shouldDisplayApproxGrams` to require non-gram unit, finite positive `approxGrams`, sufficient item confidence, and sane edible gram bounds.
  - Preserve `actions.removeItem(rowId)` behavior so existing save-undo/delayed delete behavior remains unchanged.
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\globals.css`
  - Update `.kalori-confirmation-item-inner` grid placement for name/delete/approx/kcal without changing the overall Ledger visual system.
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\ai\portion-sanity.ts`
  - Add server-side/runtime normalization for `approxGrams`: remove absurd estimates, populate conservative approximate grams when converting tiny gram countable/bowl/scoop foods to non-gram units, and lower confidence when repaired.
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\ai\prompts.ts`
  - Tighten prompt language so `approxGrams` is explicitly edible food weight, must be plausible for the named food and returned portion, and must be omitted when uncertain.
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\components\log-flow\ConfirmationScreen.test.tsx`
  - Add layout/visibility assertions around approx grams and delete button presence.
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\ai\portion-sanity.test.ts`
  - Add bounds/confidence tests for approximate grams.
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\lib\ai\prompts-approx-grams.test.ts`
  - Add prompt contract assertions for edible/plausible/omit-when-uncertain language.

## Files Affected
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\log\_components\ConfirmationScreen.tsx`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\globals.css`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\ai\portion-sanity.ts`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\ai\prompts.ts`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\components\log-flow\ConfirmationScreen.test.tsx`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\ai\portion-sanity.test.ts`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\lib\ai\prompts-approx-grams.test.ts`

## TDD Required
yes - combines UI layout behavior, display gating, and AI normalization/prompt contracts.

## Test Approach
- Component test: approx grams renders below the food/name line for non-gram item with good confidence and sane grams; kcal field remains independently addressable.
- Component test: delete `X` remains row-scoped and calls `removeItem`/removes row without changing save undo behavior.
- Component test: low confidence, gram units, nonfinite values, and absurd grams do not render approx grams.
- Unit tests: `normalizeParsedPortions` strips or repairs absurd `approxGrams`, lowers confidence on repair, and keeps plausible food-related estimates.
- Prompt test: both text and vision prompts include edible/plausible/omit-when-uncertain approximate gram guidance.

## Risk Assessment
medium - touches shared confirmation layout plus AI normalization; biggest risk is accidentally hiding useful approximate grams or changing row delete semantics.

## Regression Sweep Needed
- Confirmation row responsive layout.
- Portion editing/rescaling of `approxGrams`.
- Library-only save-to-library `nutrition.approxGrams` persistence.
- Text and vision parse output normalization.
- Existing undo toast behavior after save.

## UI Touching
true - confirmation food row layout and row delete placement.

## Open Questions
Set exact sanity thresholds before implementation. Recommendation: display only when `confidence >= 0.75`, `approxGrams >= 5`, `approxGrams <= 2000`, and for discrete units enforce a reasonable per-unit upper bound where possible.
