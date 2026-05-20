# Round 2 Fix: Nutrition Summary Opt-Out Busy State

## Finding

`NutritionSummaryReview` correctly skipped `/api/ai/nutrition-summary` when `aiSummaryOptIn` was false, but `isLoading` was derived only from `state.key !== requestKey`. Since the opt-out path intentionally never writes request state, the fallback stayed permanently `aria-busy="true"` and rendered the updating cue.

## Fix

- Derived `isLoading` from `aiSummaryOptIn && state.key !== requestKey`.
- Added a regression test through `WeeklyReviewIsland` for `range="last_30"` with AI summary consent disabled.
- Updated Bug 5 state/output records to include the R1/security-added nutrition-summary route, consent, context, migrations, and tests.

## Verification

- `pnpm vitest run tests/components/progress/WeeklyReviewIsland.period.test.tsx`
- `pnpm typecheck`
- `pnpm lint` (42 warnings, 0 errors)
