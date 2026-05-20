# Bug 7 Output: Progress weight unit switch controls entry and chart

## Files Changed
- `app/(app)/progress/page.tsx`
- `app/(app)/progress/_components/weight-quick-add.tsx`
- `components/charts/WeightTrajectoryLine.tsx`
- `tests/unit/components/charts/WeightTrajectoryLine.test.tsx`
- `tests/unit/progress/weight-quick-add.test.tsx`

## Tests Added/Modified
- `tests/unit/components/charts/WeightTrajectoryLine.test.tsx`
  - Added imperial rendering coverage for point ARIA labels, focus live text, and converted goal display.
- `tests/unit/progress/weight-quick-add.test.tsx`
  - Added `ProgressWeightTrajectoryPanel` coverage proving one top-level switch updates both the inline entry suffix and chart values.

## Commands Run
- FAIL (expected RED): `pnpm vitest run --pool threads --maxWorkers 1 tests/unit/components/charts/WeightTrajectoryLine.test.tsx tests/unit/progress/weight-quick-add.test.tsx tests/unit/lib/aggregations/progress.test.ts tests/components/progress/MicronutrientHeatmap.test.tsx`
  - Failed on bug 7 because `WeightTrajectoryLine` still rendered `75 kilograms` under `unitPref="imperial"` and `ProgressWeightTrajectoryPanel` did not exist.
- PASS: `pnpm vitest run --pool threads --maxWorkers 1 tests/unit/components/charts/WeightTrajectoryLine.test.tsx tests/unit/progress/weight-quick-add.test.tsx tests/unit/lib/aggregations/progress.test.ts tests/components/progress/MicronutrientHeatmap.test.tsx`
  - `4 passed`, `84 passed`.
- PASS: `pnpm exec eslint ...`
  - Targeted lint on the bug 7/9 touched files passed.
- PASS: `pnpm typecheck`

## Implementation Notes
- Added `ProgressWeightTrajectoryPanel` as the progress-only client owner for the kg/lb state.
- Moved the progress unit switch above the chart and wired the selected unit into both `WeightQuickAdd` and `WeightTrajectoryLine`.
- Kept persisted weight records and profile goal canonical in kg; conversion is display/input only.
- Updated chart math, y-axis domain/ticks, trend/projection, goal line label, point ARIA labels, screen-reader summary, and focus live companion to use the selected display unit.

## Residual Risk
- The panel remounts the inline quick-add form when switching units, which clears any in-progress entry. This is a conservative way to avoid stale unit/value mismatches, but it is a small UX tradeoff.
