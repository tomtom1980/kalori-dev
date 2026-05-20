# Bug 6: Remove egg-specific units from library item edit dropdown
## Classification
known_fix

## Root Cause
The library detail edit surface builds its unit dropdown from a local `UNIT_OPTIONS` constant in `FoodDetailName.tsx`. That constant includes egg-specific units (`egg`, `small egg`, `medium egg`, `large egg`) alongside general portion units, so the edit dropdown exposes those options instead of relying on generic size units such as `medium` and `large`. The existing component test `FoodDetail.mode-edit-query.test.tsx` also codifies the stale behavior by asserting the dropdown contains `large egg`.

UI guidance checked: `ui-design` + `web-ui-guide.md`. This is a native `<select>` with no animation/interaction library choice; it aligns with the existing Food Detail form pattern and `Planning/ui-design.md`'s Food Detail screen inventory.

## Proposed Change (Diff Outline)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\library\_components\FoodDetail\FoodDetailName.tsx`
  - Remove `egg`, `small egg`, `medium egg`, and `large egg` from the default `UNIT_OPTIONS` list.
  - Keep the existing generic `medium` and `large` options.
  - Preserve the current selected-unit behavior for arbitrary stored units unless the product decision is to actively normalize legacy egg-specific values during edit.
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\library\FoodDetail.mode-edit-query.test.tsx`
  - Replace the stale positive assertion for `large egg` with negative assertions that egg-specific unit labels are absent from the dropdown's default options.
  - Keep the existing assertion that the unit field is a native `SELECT` and includes normal units such as `g`.

## Files Affected
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\library\_components\FoodDetail\FoodDetailName.tsx`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\library\FoodDetail.mode-edit-query.test.tsx`

## TDD Required
yes - this is user-visible UI behavior already covered by a component test, and the existing test currently asserts the wrong option is present.

## Test Approach
Modify `tests\components\library\FoodDetail.mode-edit-query.test.tsx` so the dropdown test asserts:
- `food-detail-edit-unit-input` remains a `SELECT`.
- Normal/default units such as `g`, `medium`, and `large` are available.
- Egg-specific units `egg`, `small egg`, `medium egg`, and `large egg` are not present among options.

Run the focused component test file after implementation, then include a small library component sweep if this bug is bundled with adjacent Food Detail changes.

## Risk Assessment
low - the change is limited to the edit dropdown's offered defaults and one stale component test; persisted `default_unit` validation remains unchanged (`max 16`) and accepts arbitrary strings from existing data/API flows.

## Regression Sweep Needed
- Food Detail edit-mode rendering and save flow.
- Library card/detail display of existing `default_unit` values.
- Any add/log flow that consumes `default_unit` from library items, especially items whose stored unit may already be `large egg`.

## UI Touching
true - `FoodDetailName` edit-mode unit `<select>` on the library item detail surface.

## Open Questions
Should existing stored egg-specific units be shown as the current selected value for legacy items, or should edit mode actively coerce them to generic units (`egg` -> `piece`, `small egg` -> `small`, `medium egg` -> `medium`, `large egg` -> `large`)? The smallest safe fix only removes them from the default option list and leaves persisted values untouched.

## User Decision
Accepted behavior: preserve and display existing saved legacy egg-specific unit values, but remove egg-specific units from the dropdown options for new edits. If the user changes the unit, they must choose from the cleaned list.
