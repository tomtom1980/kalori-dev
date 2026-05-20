# Bug 10: Progress weight quick-add layout

## Status
implemented

## Summary
Grouped the inline weight and date fields into one responsive field pair while leaving kg/lb unit choice and submit controls available. This keeps progress quick-add inputs horizontally aligned when space allows without changing submit behavior.

## Files Touched
- `components/dashboard/WeightQuickAdd.tsx`
- `tests/unit/components/dashboard/WeightQuickAdd.test.tsx`
- `tests/unit/progress/weight-quick-add.test.tsx`

## Tests Added
- `tests/unit/components/dashboard/WeightQuickAdd.test.tsx::groups the weight and date fields together when inline unit choice is enabled`
- `tests/unit/progress/weight-quick-add.test.tsx::renders the progress inline weight/date fields as one responsive pair`

## Verification
- `pnpm vitest run tests/components/progress/ProgressRangeToolbar.test.tsx tests/unit/lib/aggregations/progress.test.ts tests/components/progress/MicronutrientHeatmap.test.tsx tests/unit/components/dashboard/WeightQuickAdd.test.tsx tests/unit/progress/weight-quick-add.test.tsx tests/components/progress/WeeklyReviewIsland.period.test.tsx`
- `pnpm typecheck`
