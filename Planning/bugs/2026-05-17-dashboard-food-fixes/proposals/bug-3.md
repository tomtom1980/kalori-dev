# Bug 3: Library logging defaults to 1 gram instead of the saved serving
## Classification
needs_debug_shallow

## Root Cause
The library row is correct in the database shape (`LibraryItem.default_portion` + `default_unit`), but the log-flow hydration shape drops `default_portion`. Both `lib/library/to-log-library-item.ts` and the duplicate mapper in `app/(app)/log/page.tsx` only forward `unit`, so `LibraryList.toggleItem()` creates `{ quantity: 1 }` and the confirmation payload becomes `portion: 1, unit: "g"` for gram-based foods. `LibraryList.buildParsedItemsFromSelection()` also treats the selected quantity as a raw multiplier, so simply defaulting quantity to `default_portion` would over-scale nutrition unless scaling is changed to `quantity / defaultPortion`.

## Proposed Change (Diff Outline)
- Add optional `defaultPortion` to `LogLibraryItem` in `lib/stores/useLogFlowStore.ts`.
- Forward `item.default_portion` as `defaultPortion` in `lib/library/to-log-library-item.ts`; keep fallback behavior only when the DB value is null or non-positive.
- Replace the local `/log` page mapper with the shared `toLogLibraryItem()` or update it to forward the same `defaultPortion` field, avoiding mapper drift between `/api/library/list` and `/log`.
- In `app/(app)/log/_components/AddFoodTab/LibraryList.tsx`, default a newly selected item to `it.defaultPortion ?? 1`, render that amount in the existing quantity control, and scale kcal/macros by `selectedQuantity / (it.defaultPortion ?? 1)` rather than by `selectedQuantity`.
- Keep the existing desktop input and mobile `MobileWheelPicker` UI; this aligns with `planning/ui-design.md` Log Flow §7.2.4/§7.2.5 and the web UI guide Quick-Pick table because this is a form/list state fix, not a new animation surface.

## Files Affected
C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\stores\useLogFlowStore.ts
C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\library\to-log-library-item.ts
C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\log\page.tsx
C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\log\_components\AddFoodTab\LibraryList.tsx
C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\library\to-log-library-item.test.ts
C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\library-tab-continue-cta.test.tsx

## TDD Required
yes - this is data-shape and calculation logic that affects persisted food-entry payloads.

## Test Approach
Add a RED test in `tests/unit/library/to-log-library-item.test.ts` asserting `default_portion: 50, default_unit: "g"` maps to `defaultPortion: 50` and `unit: "g"`. Add/modify `tests/components/library-tab-continue-cta.test.tsx` with a fried-egg-style library item (`defaultPortion: 50`, `unit: "g"`, `kcal: 90`) and assert selecting it enters confirmation with `portion: 50`, `unit: "g"`, and `kcal: 90`, not `portion: 1`. Also assert changing the quantity to `100` scales kcal/macros 2x, while legacy items without `defaultPortion` retain the existing multiplier behavior.

## Risk Assessment
medium - the fix changes the meaning of the library quantity field from "serving multiplier" to "displayed portion amount when defaultPortion exists", but that matches the stored serving contract and preserves legacy behavior when the field is absent.

## Regression Sweep Needed
Library modal selection and LOG SELECTED CTA, `/log?tab=library&item=...` deep-link confirmation, `/api/library/list` response-shape tests, library detail LOG THIS NOW route, and confirmation save payloads for `source: "library"`.

## UI Touching
true - `app/(app)/log/_components/AddFoodTab/LibraryList.tsx` quantity control inside the log-flow modal. No new visual pattern is proposed; reuse the existing input and mobile wheel sheet.

## Open Questions
None for implementation. If the product wants the quantity field to mean "number of servings" instead of "portion amount", that is a separate UX change; the current bug should be fixed against the existing library `default_portion/default_unit` contract.
