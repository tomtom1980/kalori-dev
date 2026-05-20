# Bug 4: Data table view close button should match shared popup X style

## Status
implemented

## Summary
Changed `DataTableDrawer` to use the shared icon-only `kalori-log-close` chrome with a lucide `X`, preserving the existing accessible close label.

## Files Touched
- `components/charts/DataTableDrawer.tsx`
- `tests/components/progress/MicronutrientHeatmap.test.tsx`

## Tests Added
- `tests/components/progress/MicronutrientHeatmap.test.tsx::data-table drawer close is an icon-only X button with stable accessible name`

## Verification
- `pnpm vitest run tests/components/progress/ProgressRangeToolbar.test.tsx tests/unit/lib/aggregations/progress.test.ts tests/components/progress/MicronutrientHeatmap.test.tsx tests/unit/components/dashboard/WeightQuickAdd.test.tsx tests/unit/progress/weight-quick-add.test.tsx tests/components/progress/WeeklyReviewIsland.period.test.tsx`
- `pnpm typecheck`
