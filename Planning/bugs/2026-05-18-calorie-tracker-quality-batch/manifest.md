# Bugfix Batch Manifest: 2026-05-18 Calorie Tracker Quality Batch

## Summary

Archived Phase 8.2 documentation package for the calorie tracker quality batch. The batch implemented 12 fixes across mobile navigation, async loading feedback, photo upload behavior, chart/dialog chrome, AI summaries, progress date controls, food-log time validation, parsed-food micronutrients, approximate grams, progress quick-add layout, micronutrient heatmap collapse behavior, and heatmap detail interactions.

## Bugs Fixed

| Bug | Status | Summary | Primary Files |
| --- | --- | --- | --- |
| 1 | Implemented | Wired mobile account menu Settings and Export actions to existing settings surfaces. | `components/nav/profile-menu.tsx`, `app/(app)/settings/_components/DataSubsection.tsx` |
| 2 | Implemented | Added missing pending/busy states for high-confidence async actions across progress range navigation, Copy Yesterday, library quota checks, bulk log, and quick-log meal actions. | `app/(app)/progress/_components/ProgressRangeToolbar.tsx`, `app/(app)/log/copy-yesterday/_components/CopyYesterdayModal.tsx`, `app/(app)/library/_components/{BulkActionsBar,LibraryClient}.tsx` |
| 3 | Implemented | Split photo tab desktop upload-only behavior from mobile camera capture behavior. | `app/(app)/log/_components/SnapTab.tsx`, `lib/i18n/en.ts` |
| 4 | Implemented | Replaced data-table drawer text close button with shared icon-only popup X style. | `components/charts/DataTableDrawer.tsx` |
| 5 | Implemented | Added real AI nutrition summaries for dashboard daily summary and progress ranges, including shared summary context, prompt/schema, cache call type, and migration. | `app/api/ai/nutrition-summary/route.ts`, `components/dashboard/DailyEditorsNote.tsx`, `components/charts/{NutritionSummaryReview,WeeklyReviewCore}.tsx`, `lib/{aggregations,ai}/**`, `supabase/migrations/0024_nutrition_summary_call_type.sql` |
| 6 | Implemented | Reworked progress date controls to Last 7 days, Last 30 days, and validated Custom ranges. | `app/(app)/progress/page.tsx`, `app/(app)/progress/_components/{ProgressRangeToolbar,weekly-review-island,weight-quick-add}.tsx`, `lib/aggregations/progress*.ts` |
| 7 | Implemented | Blocked future food-log timestamps in client validation and server/library save paths with explicit copy and skew-tolerance tests. | `app/(app)/log/_components/Confirmation/TimeEditor.tsx`, `app/(app)/log/_components/ConfirmationScreen.tsx`, `app/api/{entries/save,library/[id]/log-now}/route.ts` |
| 8 | Implemented | Displayed parsed-food micronutrients in standard confirmation rows, defaulting to the top daily-target micronutrient with expandable full list. | `app/(app)/log/_components/ConfirmationScreen.tsx`, `app/globals.css`, `lib/i18n/en.ts` |
| 9 | Implemented | Improved food row layout, delete-button alignment, and approximate-grams display/repair rules. | `app/(app)/log/_components/ConfirmationScreen.tsx`, `app/globals.css`, `lib/ai/{portion-sanity,prompts}.ts` |
| 10 | Implemented | Grouped progress weight quick-add weight and date fields as a responsive pair while preserving unit choice. | `components/dashboard/WeightQuickAdd.tsx` |
| 11 | Implemented | Kept collapsed progress micronutrient heatmap to top 4 rows without scrollbars and updated toggle copy. | `components/charts/MicronutrientHeatmap.tsx`, `app/globals.css`, `lib/i18n/en.ts` |
| 12 | Implemented | Added hover value preview and persistent accessible heatmap detail popup with X, outside-click, and Escape dismissal. | `components/charts/HeatmapInteractive.tsx`, `app/globals.css`, `lib/i18n/en.ts` |

## Review Package

- Proposals: `proposals/bug-1.md` through `proposals/bug-12.md`
- Implementation outputs: `outputs/bug-1.md` through `outputs/bug-12.md`
- Codex reviews: `codex/round-1-substitute-review.md`, `codex/round-1-categorized.md`, `codex/fixes-r1-review.md`, `codex/round-2-substitute-review.md`, `codex/round-2-categorized.md`, `codex/fixes-r2-review.md`
- Security review: `security-review.md`
- E2E and regression docs: `e2e-results.md`, `regression-diagnosis.md`, `integration-verification.md`
- Context and lessons: `project-context.md`, `lessons-relevant.md`, `state.md`
- Phase 7 logs: `phase7-focused-chromium-rerun.log`, `phase7-visual-baseline-rerun.log`

## Verification Summary

Final pre-package verification recorded in `state.md` and `integration-verification.md` passed `git diff --check`, `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, and focused non-visual Chromium E2E. The final focused non-visual E2E command reported 32 tests executed, 21 passed, 11 skipped, and 0 failed.

## Pending Follow-Up

Visual baselines were not updated in this packaging pass. Earlier visual baseline reruns recorded drift and auth-rate-limit noise; the pending follow-up is to run a deliberate visual baseline review/update workflow separately.
