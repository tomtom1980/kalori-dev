# Bug 1: Whole-style units must only allow integer quantities

## Classification
needs_debug_shallow

STOP FLAGS: proposed complete fix touches more than 5 files; existing comments intentionally allow fractional direct input for discrete units and classify `cup`/`cups` as continuous.

## Root Cause
The app has a unit heuristic in `lib/log/portion-unit.ts`, but it is only used by the confirmation screen's step size and mobile wheel options. That helper currently treats `cup` and `cups` as continuous units, while `serving`, `portion`, `large egg`, and `medium fruit` resolve as discrete mostly by omission from the continuous set. Even for discrete units, `ConfirmationScreen` still accepts decimal manual typing, `LibraryList` accepts fractional re-log quantities for every unit, Food Detail edit accepts decimal default portions, and server Zod schemas accept any positive number. UI guidance alignment: `Planning/ui-design.md` tiebreaker #23 prescribes `MobileWheelPicker` for mobile portion/confirmation quantity changes; this fix should keep that pattern and only change allowed option values/validation.

## Proposed Change (Diff Outline)
- `lib/log/portion-unit.ts`: replace the current continuous-only heuristic with an explicit shared whole-style unit contract. Add helpers such as `isWholeStyleUnit(unit)` and `coerceWholeStyleQuantity(unit, quantity)` or equivalent. Treat normalized `cup`, `cups`, `serving(s)`, `portion(s)`, `egg(s)`, adjective+noun phrases like `large egg` / `medium fruit`, and existing discrete defaults as whole-style; keep true measurement units like `g`, `ml`, `oz`, `tbsp`, `tsp` fractional.
- `app/(app)/log/_components/ConfirmationScreen.tsx`: use the shared helper for portion edits. For whole-style units, set `step={1}`, `inputMode="numeric"`, snap mobile wheel options to integers, and reject or coerce decimal typed input before reducer rescaling.
- `app/(app)/log/_components/AddFoodTab/LibraryList.tsx`: use the shared helper against `it.unit`. For whole-style library items, default selected quantity to an integer, render integer-only mobile wheel options, use `step={1}` / numeric mode on desktop, and reject or coerce decimal edits.
- `app/(app)/library/_components/FoodDetail/useFoodDetailEdit.ts` and `FoodDetailName.tsx`: validate `default_portion` as integer when the selected `default_unit` is whole-style, keep the existing inline error pattern, and switch input mode/step hints accordingly.
- Server/API validation should enforce the same invariant for persisted/logged data, not only the UI: `app/api/entries/save/route.ts`, `lib/library/create-schema.ts`, `app/(app)/library/_components/FoodDetail/foodDetail.schema.ts`, `app/api/library/[id]/update/route.ts`, and `app/api/library/merge/route.ts` need shared refinement or preprocessing so direct authenticated POSTs cannot persist `1.5 serving`, `0.5 cup`, etc.
- Optional follow-up if scope must be reduced: first patch only `lib/log/portion-unit.ts`, `ConfirmationScreen`, `LibraryList`, and tests, then separately harden server/library edit schemas. This is lower confidence because it leaves API bypasses.

## Files Affected
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\log\portion-unit.ts`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\log\_components\ConfirmationScreen.tsx`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\log\_components\AddFoodTab\LibraryList.tsx`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\library\_components\FoodDetail\useFoodDetailEdit.ts`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\library\_components\FoodDetail\FoodDetailName.tsx`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\api\entries\save\route.ts`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\library\create-schema.ts`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\library\_components\FoodDetail\foodDetail.schema.ts`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\api\library\[id]\update\route.ts`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\api\library\merge\route.ts`

## TDD Required
yes - this is validation/control-flow and persistence-boundary behavior.

## Test Approach
- Add/update `tests/unit/lib/log/portion-unit.test.ts` to assert `serving`, `portion`, `cup`, `cups`, `large egg`, `medium fruit`, and unknown count nouns are whole-style/integer-only, while `g`, `ml`, `tbsp`, `tsp`, `oz`, etc. remain fractional.
- Add confirmation tests in `tests/unit/components/log-flow/ConfirmationScreen.test.tsx` for whole-style unit input: decimal typing is rejected or snapped, integer edits rescale nutrition, and save payload contains an integer.
- Add library re-log tests in `tests/components/library-tab-continue-cta.test.tsx` for `unit: 'cup'` or `unit: 'serving'`: decimal input/wheel values cannot produce a fractional `portion` in `confirmationPayload`.
- Add Food Detail edit validation tests in `tests/unit/library/food-detail-edit-validation.test.ts` for decimal `default_portion` with `default_unit: 'serving' | 'cup' | 'large egg'`, and a control case allowing decimal grams/ml.
- Add API/schema tests for `/api/entries/save`, `CreateLibraryBodySchema`, Food Detail edit schema, and merge/update schema paths to reject direct decimal quantities for whole-style units.

## Risk Assessment
medium - nutrition scaling is quantity-based across log, library, and edit flows; making units integer-only can change accepted historical/user-entered payloads and requires consistent client/server behavior to avoid UI/API drift.

## Regression Sweep Needed
- Add Food tab type/photo/manual confirmation flows.
- Library re-log flow from modal.
- `/log?tab=library&item=<id>&quantity=<n>` deep-link flow.
- Library-only add flow.
- Food Detail edit/save flow.
- Library merge default portion/unit selection.
- Direct API tests for `entries/save`, `library/create`, `library/[id]/update`, and `library/merge`.

## UI Touching
true - `ConfirmationScreen`, `AddFoodTab/LibraryList`, and Food Detail edit quantity inputs. Keep existing Ledger form patterns, inline error placement, `MobileWheelPicker` on mobile per `Planning/ui-design.md` tiebreaker #23, and existing mono numeric styling.

## Open Questions
- Should `cup` always be integer-only, even though it is often a real fractional volume measurement in food tracking? The bug says yes, but this conflicts with the current helper's documented continuous-unit behavior.
- For typed decimal values on whole-style units, should implementation reject with an inline validation error or automatically round/snap to the nearest integer? Rejecting is clearer and avoids silently changing nutrition; snapping matches existing wheel behavior.
- Should existing persisted fractional whole-style rows be migrated/normalized, or should the fix only apply to future edits/saves?

## User Decision
User confirmed `cup`/`cups` should be integer-only everywhere, even though fractional cup quantities are common in food tracking.
