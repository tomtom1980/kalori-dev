# Bug 6: Redo progress date buttons

## Status
implemented

## Summary
Replaced the progress range model with `Last 7 days`, `Last 30 days`, and `Custom`; added custom range validation and canonical URL redirects for invalid or legacy ranges; updated aggregation windows and progress/weight range plumbing so the weight trajectory follows the selected progress range.

## Files Touched
- `app/(app)/progress/page.tsx`
- `app/(app)/progress/_components/ProgressRangeToolbar.tsx`
- `app/(app)/progress/_components/weekly-review-island.tsx`
- `app/(app)/progress/_components/weight-quick-add.tsx`
- `components/charts/WeightTrajectoryLine.tsx`
- `lib/aggregations/progress.ts`
- `lib/aggregations/progress-fetch.ts`
- `lib/i18n/en.ts`
- `tests/components/progress/ProgressRangeToolbar.test.tsx`
- `tests/components/progress/WeeklyReviewIsland.period.test.tsx`
- `tests/unit/lib/aggregations/progress.test.ts`

## Tests Added
- `tests/components/progress/ProgressRangeToolbar.test.tsx::renders Last 7 days, Last 30 days, and Custom segments`
- `tests/components/progress/ProgressRangeToolbar.test.tsx::shows labeled custom date fields and commits a valid custom range`
- `tests/components/progress/ProgressRangeToolbar.test.tsx::blocks invalid custom ranges inline without navigating`
- `tests/unit/lib/aggregations/progress.test.ts::last_7 range = seven day buckets ending today`
- `tests/unit/lib/aggregations/progress.test.ts::last_30 range = thirty day buckets ending today`
- `tests/unit/lib/aggregations/progress.test.ts::custom range emits inclusive day buckets between start and end`
- `tests/unit/lib/aggregations/progress.test.ts::normalizes old D/W/M URL ranges to safe new ranges`
- `tests/unit/lib/aggregations/progress.test.ts::accepts valid custom params and rejects invalid/future/overlong custom ranges`
- `tests/unit/lib/aggregations/progress.test.ts::custom range excludes entries outside explicit start/end dates`

## Verification
- `pnpm vitest run tests/components/progress/ProgressRangeToolbar.test.tsx tests/unit/lib/aggregations/progress.test.ts tests/components/progress/MicronutrientHeatmap.test.tsx tests/unit/components/dashboard/WeightQuickAdd.test.tsx tests/unit/progress/weight-quick-add.test.tsx tests/components/progress/WeeklyReviewIsland.period.test.tsx`
- `pnpm vitest run tests/unit/lib/aggregations/progress-fetch.test.ts tests/unit/components/charts/WeightTrajectoryLine.test.tsx`
- `pnpm typecheck`

## Recovery Review-Fix Addendum - 2026-05-18T23:05:35+07:00

- Fixed the review finding for custom date state staleness without render-time state updates.
- `ProgressRangeToolbar` now derives URL-backed custom date values when the custom state key changes, avoiding both render-time state writes and effect-time state writes.
- Preserved the regression test `syncs custom date inputs when URL-derived props change`.

Focused verification:
- PASS: `pnpm test tests/components/progress/ProgressRangeToolbar.test.tsx tests/components/progress/MicronutrientHeatmap.test.tsx -- --reporter=verbose`.
- PASS: `pnpm test tests/components/progress/ProgressRangeToolbar.test.tsx -- --reporter=verbose` after replacing effect-based state sync with derived URL-backed state.
- PASS: `pnpm lint` with 42 existing warnings / 0 errors.
