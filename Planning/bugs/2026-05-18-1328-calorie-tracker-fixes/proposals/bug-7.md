# Bug 7: Progress weight unit switch controls entry and chart

## Classification
known_fix

## Root Cause
The progress page currently renders the unit switch as part of the inline weight quick-add form, so the switch only affects the entry field. `WeightTrajectoryLine` already declares a `unitPref` prop, but the component does not read it and all chart math, ticks, accessibility labels, focus live text, goal positioning, and point values render from raw kg. `WeightTrajectorySection` also fetches only `goal_weight_kg` and passes kg-only props to the chart, so an imperial user can log lb while still seeing kg chart values and a kg goal line.

UI alignment: `Planning/ui-design.md` prescribes the weight trajectory chart meta as `{start} -> {current} kg / {delta} over {range}` plus inline quick-add, and the onboarding/settings rules state the weight unit toggle is display preference only while DB storage stays metric. The web UI guide Quick-Pick table maps dashboard charts/KPIs to Tremor/Recharts-style dashboard patterns; this app has an intentional bespoke SVG chart deviation, so the fix should preserve the existing chart/control aesthetic and move the existing segmented kg/lb control to chart-level rather than adding a new charting library.

## Proposed Change (Diff Outline)
- `app/(app)/progress/page.tsx`
  - Keep `unit_pref` in the initial profile read.
  - Pass `unitPref` into `WeightTrajectorySection`.
  - Replace the separate inline quick-add + chart rendering with a single client-side progress weight panel export from the existing progress weight component module, so one `selectedUnit` state controls both entry and chart.
- `app/(app)/progress/_components/weight-quick-add.tsx`
  - Add/export a progress weight trajectory panel that renders the kg/lb segmented control at the top of the chart area, then renders `ProgressWeightQuickAdd` and `WeightTrajectoryLine` with the same selected unit.
  - Let `ProgressWeightQuickAdd` disable its internal unit selector when the parent panel owns the unit switch, while preserving current inline date-entry behavior.
  - Keep the control shape consistent with the existing radio/segmented kg/lb labels and 44px tap target pattern.
- `components/charts/WeightTrajectoryLine.tsx`
  - Use `unitPref` to convert entries and `goalWeightKg` from kg to lb for display/math when imperial.
  - Keep canonical incoming props in kg; convert only in the presentational layer using `kgToLb` and `roundToOneDecimal`.
  - Update y-axis ticks, point positions, trend/projection math, goal line, screen-reader summary, point aria labels, and focus live companion to use the display unit and unit label.
- `tests/unit/components/charts/WeightTrajectoryLine.test.tsx`
  - Add unit tests for imperial rendering: y-axis/point accessibility/live text and goal line use converted lb values, and raw kg values are not exposed as lb.
  - Keep existing metric tests passing as the default behavior.
- `tests/unit/progress/weight-quick-add.test.tsx`
  - Add a wrapper/panel test proving one unit switch changes the entry suffix/input semantics and chart-rendered values together.

## Files Affected
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\progress\page.tsx`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\progress\_components\weight-quick-add.tsx`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\charts\WeightTrajectoryLine.tsx`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\components\charts\WeightTrajectoryLine.test.tsx`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\progress\weight-quick-add.test.tsx`

## TDD Required
yes - this touches conversion/rendering logic and a UI control that changes both input semantics and chart values. Red tests should cover kg->lb conversion for records and goal, and the shared unit-control behavior before implementation.

## Test Approach
- Add failing chart unit tests first:
  - render `WeightTrajectoryLine` with entries like `75 kg` and `goalWeightKg={70}` plus `unitPref="imperial"`;
  - assert the accessible point text and/or focus live text exposes `165.3 lb` and the goal/ticks are based on converted lb values;
  - assert metric default still exposes `75 kg` and does not convert.
- Add a failing progress panel/component test:
  - render the progress weight panel with `unitPref="metric"`, a chart entry, and a goal;
  - switch the top-level control to lb;
  - assert the quick-add suffix changes to `lb` and the chart accessibility/display values change to converted lb without a separate chart control.
- Run focused suites:
  - `pnpm vitest run tests/unit/components/charts/WeightTrajectoryLine.test.tsx tests/unit/progress/weight-quick-add.test.tsx`
  - If page wiring changes are significant, also run the existing B4 focused E2E or at minimum `tests/e2e/web/user-stories/US-STAB-B4.spec.ts` after implementation.

## Risk Assessment
medium - the files are limited, but chart coordinate math, accessibility strings, goal/projection segments, and quick-add input semantics all share the same unit state and can regress silently if only visual output is checked.

## Regression Sweep Needed
- Progress weight trajectory chart: empty, single-point, 2-4 point, 5+ point trend/projection, 14-day gap annotation.
- Progress inline weight quick-add: kg and lb bounds, POST body remains kg, date input still present.
- `/weight` page quick-add/history: should remain unaffected because the new shared chart-level control is progress-only.
- Existing B4 router-refresh behavior after weight save.
- Visual baseline for `/progress` if the top-of-chart control changes layout materially.

## UI Touching
true - `/progress` weight trajectory section, specifically the kg/lb segmented unit control, inline weight entry, and `WeightTrajectoryLine` SVG chart.

## Open Questions
None blocking. The safest interpretation is that the progress-page kg/lb switch is a display/input unit selector only; persisted weight records and profile goal remain kg-canonical.
