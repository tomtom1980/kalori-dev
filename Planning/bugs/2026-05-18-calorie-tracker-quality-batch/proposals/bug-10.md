# Bug 10: Progress weight quick-add layout
## Classification
known_fix

## Root Cause
`WeightQuickAdd` renders the weight field, optional kg/lb unit choice, optional date field, and submit button as siblings in one wrapping flex row. In progress usage, `ProgressWeightQuickAdd` enables both `allowUnitChoice` and `showDateInput`, so the unit selector can sit between the weight input and date input instead of keeping the weight entry field and date selector visually paired. The web UI guide Quick-Pick table does not require an animation library here; this is a static responsive layout fix, so CSS/flex composition is the appropriate zero-bundle approach.

## Proposed Change (Diff Outline)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\dashboard\WeightQuickAdd.tsx`
  - Introduce a local `hasDateInput` boolean for `mode === 'page' || showDateInput`.
  - Wrap the weight input block and date input block in a nested responsive row so they remain adjacent as a single logical group.
  - Keep the kg/lb unit choice and submit button outside that field-pair group, preserving existing behavior while moving the date next to the weight entry field when `allowUnitChoice` is true.
  - Preserve existing `data-testid` values, labels, validation/error rendering, input refs, and submit flow.
  - Use responsive flex widths/min widths only; no new dependency, no animation, no behavior changes.
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\components\dashboard\WeightQuickAdd.test.tsx`
  - Add/extend a render test for `mode="inline" allowUnitChoice showDateInput` proving the weight field/date field are in the same layout group and the unit selector remains available.
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\progress\weight-quick-add.test.tsx`
  - Add/extend coverage for the progress wrapper mount to assert the shared component still exposes date input and unit choice while preserving existing validation behavior.
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\visual\weight.spec.ts`
  - Re-run the existing `/weight` visual baseline to catch shared-component regressions.

## Files Affected
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\dashboard\WeightQuickAdd.tsx`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\components\dashboard\WeightQuickAdd.test.tsx`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\progress\weight-quick-add.test.tsx`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\visual\weight.spec.ts`

## TDD Required
no - this is a pure responsive layout/CSS composition change with no logic, wire format, validation, or state behavior change. Add regression tests first if desired, but strict RED-first TDD is waived under the cosmetic/layout exception.

## Test Approach
- Unit/render: add a focused assertion that progress inline quick-add renders the weight input and date input inside a shared layout group while kg/lb selection remains rendered.
- Regression: run existing `WeightQuickAdd` unit tests to confirm submit, conversion, rollback, validation, and accessibility selectors remain intact.
- Progress: run `tests/unit/progress/weight-quick-add.test.tsx` to confirm inline progress behavior and unit switching still work.
- Visual: run `/weight` visual baseline and, if an existing progress visual route is available in the suite, include it for mobile/tablet/desktop responsive confirmation.

## Risk Assessment
medium - the implementation touches a shared component used by `/weight` and progress/dashboard-adjacent flows, but the proposed change is markup/layout-only and can preserve all public props and test IDs.

## Regression Sweep Needed
- `/weight` page quick-add form layout and note field.
- Progress weight trajectory inline quick-add layout, especially `allowUnitChoice + showDateInput`.
- Dashboard/target-updated weight flow that imports the same shared component.
- Mobile widths around 375px to ensure the grouped inputs wrap cleanly instead of overflowing.

## UI Touching
true - `components/dashboard/WeightQuickAdd.tsx` shared web form layout.

## Open Questions
None before implementation. The requested agreement is clear: keep the weight value input with kg/lb context and the date selector horizontally adjacent where space allows, while allowing responsive wrapping on mobile.
