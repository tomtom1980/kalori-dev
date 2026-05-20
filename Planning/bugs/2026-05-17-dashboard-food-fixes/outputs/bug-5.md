# Bug 5 Output: Progress editor note period awareness

## Files Changed
- `app/(app)/progress/page.tsx`
- `app/(app)/progress/_components/weekly-review-island.tsx`
- `components/charts/WeeklyReviewCore.tsx`
- `lib/i18n/en.ts`
- `tests/components/progress/WeeklyReviewCore.test.tsx`
- `tests/components/progress/WeeklyReviewIsland.period.test.tsx`

## Tests Added/Modified
- Modified `tests/components/progress/WeeklyReviewCore.test.tsx`
  - Added D-period note coverage proving daily copy renders without the weekly drop cap.
  - Added M sparse-period coverage proving the 30-day window copy replaces weekly/past-seven copy.
- Added `tests/components/progress/WeeklyReviewIsland.period.test.tsx`
  - Proves `range=D` renders from `fetchProgressSnapshot(...)` and does not call the weekly-review fetch path.

## Implementation Notes
- `/progress` now passes the selected `range` and profile target slice into `WeeklyReviewIsland`.
- `WeeklyReviewIsland` keeps the existing W-range Supabase/cache/Gemini weekly-review path unchanged.
- D/M ranges render deterministic period notes from the existing progress aggregate.
- `WeeklyReviewCore` now accepts `periodRange="D" | "M"` so D/M notes get period mastheads/copy and skip the 82px weekly drop cap.
- Zero-log D/M states render period-aware sparse copy.

## Commands Run
- `pnpm vitest tests/components/progress/WeeklyReviewCore.test.tsx tests/components/progress/WeeklyReviewIsland.period.test.tsx --run --pool threads --maxWorkers 1`
  - Initial RED: failed as expected before implementation.
  - Final result: PASS, 2 files / 12 tests.
- `pnpm vitest tests/unit/components/charts/weekly-review-drop-cap-singleton.test.ts tests/integration/progress-page-profile-lookup-guard.test.ts --run --pool threads --maxWorkers 1`
  - PASS, 2 files / 4 tests.
- `pnpm vitest tests/components/progress/WeeklyReviewCore.test.tsx tests/components/progress/WeeklyReviewIsland.period.test.tsx tests/unit/components/charts/weekly-review-drop-cap-singleton.test.ts tests/integration/progress-page-profile-lookup-guard.test.ts --run --pool threads --maxWorkers 1`
  - PASS, 4 files / 16 tests.
- `pnpm exec prettier --check 'app/(app)/progress/page.tsx' 'app/(app)/progress/_components/weekly-review-island.tsx' components/charts/WeeklyReviewCore.tsx lib/i18n/en.ts tests/components/progress/WeeklyReviewCore.test.tsx tests/components/progress/WeeklyReviewIsland.period.test.tsx`
  - PASS after formatting.
- `pnpm typecheck`
  - FAIL due unrelated in-flight worker tests/files:
    - `lib/library/to-log-library-item.ts` / `tests/unit/library/to-log-library-item.test.ts` have Bug 3 `defaultPortion` type work in progress.
    - `tests/unit/components/DuplicateLogConfirmDialog.test.tsx` imports missing Bug 2 file.
  - No Bug 5 type errors remained after the local `periodRange` indexing fix.

## Pass/Fail
- Focused Bug 5 verification: PASS.
- Full typecheck: BLOCKED by unrelated concurrent bug workers.

## Residual Risks
- D/M notes are deterministic and not AI-generated. This matches the approved fix; arbitrary-period Gemini review would require a separate API/cache/table contract.
- I did not run browser E2E for `/progress?range=D|W|M`; scoped component/integration tests cover the data-path branch and copy behavior.
