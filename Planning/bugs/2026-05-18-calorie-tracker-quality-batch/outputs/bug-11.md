# Bug 11: Progress micronutrient table collapsed view should stay top 4 without scrollbars

## Status
implemented

## Summary
Kept collapsed micronutrients to the ranked top four, removed collapsed scrollbars, preserved expanded scrolling, and changed the toggle copy to `Show all micronutrients` / `Hide all micronutrients`.

## Files Touched
- `components/charts/MicronutrientHeatmap.tsx`
- `app/globals.css`
- `lib/i18n/en.ts`
- `tests/components/progress/MicronutrientHeatmap.test.tsx`

## Tests Added
- `tests/components/progress/MicronutrientHeatmap.test.tsx` collapsed/expanded assertions now cover top-four rows, toggle copy, and scroll containment

## Verification
- `pnpm vitest run tests/components/progress/ProgressRangeToolbar.test.tsx tests/unit/lib/aggregations/progress.test.ts tests/components/progress/MicronutrientHeatmap.test.tsx tests/unit/components/dashboard/WeightQuickAdd.test.tsx tests/unit/progress/weight-quick-add.test.tsx tests/components/progress/WeeklyReviewIsland.period.test.tsx`
- `pnpm typecheck`
