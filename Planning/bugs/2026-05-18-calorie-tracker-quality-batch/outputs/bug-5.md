# Bug 5: Real AI summaries for dashboard daily summary and progress

## Status
implemented

## Summary
- Added the shared `/api/ai/nutrition-summary` call type and route for dashboard-day and progress-range summaries.
- Added a normalized nutrition summary context builder with stable SHA-256 fingerprints covering scope/range, food, water, weight, goals/profile, timezone, and caveats.
- Added `NutritionSummaryResult` / model schemas and `v1_nutritionSummary` prompt with separate structured parts for range, goals/profile, food, water, weight, and caveats.
- Switched the dashboard daily editor note to an AI-backed client surface with a first-load skeleton when no summary is available, previous-summary retention during refresh, and subtle `aria-busy` updating state.
- Switched the progress summary island to the shared nutrition-summary client surface for current range presets.
- Added migration `0024_nutrition_summary_call_type.sql` for `ai_response_cache` and `ai_call_log`.

## Files Touched
- `app/api/ai/nutrition-summary/route.ts`
- `app/(app)/progress/_components/weekly-review-island.tsx`
- `components/charts/NutritionSummaryReview.tsx`
- `components/charts/WeeklyReviewCore.tsx`
- `components/dashboard/DailyEditorsNote.tsx`
- `lib/aggregations/summary-context.ts`
- `lib/ai/cache.ts`
- `lib/ai/cost-log.ts`
- `lib/ai/prompts.ts`
- `lib/ai/schemas.ts`
- `lib/i18n/en.ts`
- `supabase/migrations/0024_nutrition_summary_call_type.sql`
- `tests/unit/lib/ai/nutrition-summary.test.ts`
- `tests/integration/ai-nutrition-summary.test.ts`
- `tests/components/dashboard/DailyEditorsNote.test.tsx`
- `tests/components/progress/WeeklyReviewIsland.period.test.tsx`
- `tests/components/progress/WeeklyReviewCore.test.tsx`

## Tests Added / Updated
- `tests/unit/lib/ai/nutrition-summary.test.ts`
- `tests/integration/ai-nutrition-summary.test.ts`
- `tests/components/dashboard/DailyEditorsNote.test.tsx`
- `tests/components/progress/WeeklyReviewIsland.period.test.tsx`
- `tests/components/progress/WeeklyReviewCore.test.tsx`

## Verification
- `pnpm vitest run tests/unit/lib/ai/nutrition-summary.test.ts tests/integration/ai-nutrition-summary.test.ts tests/components/dashboard/DailyEditorsNote.test.tsx tests/components/progress/WeeklyReviewIsland.period.test.tsx --pool threads --maxWorkers 1` - passed.
- `pnpm vitest run tests/components/progress/WeeklyReviewCore.test.tsx tests/integration/ai-weekly-review.test.ts tests/integration/ai-weekly-review-refresh.test.ts --pool threads --maxWorkers 1` - passed.
- `pnpm vitest run tests/unit/lib/ai/nutrition-summary.test.ts tests/integration/ai-nutrition-summary.test.ts tests/components/dashboard/DailyEditorsNote.test.tsx tests/components/progress/WeeklyReviewIsland.period.test.tsx tests/components/progress/WeeklyReviewCore.test.tsx tests/integration/ai-weekly-review.test.ts tests/integration/ai-weekly-review-refresh.test.ts --pool threads --maxWorkers 1` - passed.
- `pnpm typecheck` - passed.

## Residual Risks
- The dashboard and progress summaries now refresh from client islands, so first visible summary depends on browser fetch rather than RSC prefetch.
- The route logs exactly once for normal cache/miss/fallback paths; if a caller reuses the same `client_id` with a changed fingerprint, the unique log index can still treat that as a duplicate at DB level. The client components mint a new id per fetch to avoid that path.
- Migration must be applied before production traffic uses the new `nutrition-summary` call type.

## Phase 7 regression note
- Added reduced-motion guards to `DailyEditorsNote` and `NutritionSummaryReview` opacity transitions.
- `DailyEditorsNote` now follows the approved Bug 5 client-island behavior: it shows a skeleton on first load when no cached/initial summary exists, keeps the previous summary visible while an AI refresh is pending, and only swaps to deterministic fallback after the active AI request fails.
- Vision-route regression tests now mock the image quota count chain introduced by the batch, returning zero usage.
- `lib/database.types.ts` was refreshed through `0024_nutrition_summary_call_type.sql`, and the migration dry-run fixture now treats `0024` as applied in its all-applied dev scenario.

## Focused regression follow-up
- Fixed the remaining `tests/components/dashboard/DailyEditorsNote.test.tsx` failures by retaining `state.summary` across request-key changes instead of rendering deterministic fallback during refresh.
- Added the missing `daily-editors-note-skeleton` first-load state back to `DailyEditorsNote`.
- Updated the legacy unit component expectation to match the approved first-load skeleton behavior.
- Verification: `pnpm test tests/components/dashboard/DailyEditorsNote.test.tsx -- --reporter=verbose` passed, 1 file / 2 tests.
- Verification: `pnpm test tests/unit/components/dashboard/DailyEditorsNote.test.tsx -- --reporter=verbose` passed, 1 file / 3 tests.
- Verification: `pnpm typecheck` passed.
- Verification: `pnpm lint` passed with 42 warnings / 0 errors.

## Post-validation accessibility regression follow-up

### Files Changed
- `components/dashboard/DailyEditorsNote.tsx`
- `tests/unit/components/dashboard/DailyEditorsNote.test.tsx`
- `planning/.tmp/bugfix-2026-05-18-calorie-tracker-quality-batch/regression-diagnosis.md`
- `planning/.tmp/bugfix-2026-05-18-calorie-tracker-quality-batch/state.md`

### Diagnosis
- The composed dashboard accessibility test failed because first-load `DailyEditorsNote` rendered only `data-testid="daily-editors-note-skeleton"`.
- The stable `data-testid="daily-editors-note"` container existed only after the AI summary resolved, so the daily summary surface disappeared from the first-load dashboard DOM.

### Fix
- Preserved the first-load skeleton.
- Kept the dashboard daily summary surface accessible/testable by exposing `data-testid="daily-editors-note"` on the skeleton shell with `role="status"`, `aria-busy="true"`, and an accessible label.
- Moved `data-testid="daily-editors-note-skeleton"` to the inner skeleton wrapper so existing skeleton tests continue to assert the loading branch.

### Commands Run
- RED: `pnpm test tests/unit/components/dashboard/DailyEditorsNote.test.tsx -- --reporter=verbose` failed because `daily-editors-note` was missing during first load.
- PASS: `pnpm test tests/unit/components/dashboard/DailyEditorsNote.test.tsx -- --reporter=verbose`.
- PASS: `pnpm test tests/integration/dashboard-a11y.test.tsx tests/components/dashboard/DailyEditorsNote.test.tsx tests/unit/components/dashboard/DailyEditorsNote.test.tsx -- --reporter=verbose` (3 files / 20 tests).
- PASS: `pnpm typecheck`.
- PASS: `pnpm exec eslint components/dashboard/DailyEditorsNote.tsx tests/components/dashboard/DailyEditorsNote.test.tsx tests/unit/components/dashboard/DailyEditorsNote.test.tsx tests/integration/dashboard-a11y.test.tsx`.

### Notes
- Vitest printed MSW interceptor `socket hang up` messages after the passing three-file run, but the command exited 0.

## Recovery Review-Fix Addendum - 2026-05-18T23:05:35+07:00

- Preserved the prior partial route/context work for AI summaries.
- Confirmed `summary-context.ts` buckets food with the user's timezone local day and fails closed on Supabase read errors.
- Confirmed the route rejects reused `client_id` conflicts before Gemini/logging, future dashboard/progress dates before context reads, and disabled consent before context reads.
- Tightened client privacy defaults: `DailyEditorsNote`, `NutritionSummaryReview`, and `WeeklyReviewIsland` now default `aiSummaryOptIn` to false; dashboard/progress pages must pass the server-owned profile consent flag explicitly.
- Updated the opted-in component tests to pass `aiSummaryOptIn`.
- Updated the future progress-range route test to use an always-future 2099 range.

## Round 2 Cleanup Addendum - 2026-05-18

- Fixed the opt-out progress summary fallback so `NutritionSummaryReview` does not stay permanently busy when AI summary consent is disabled.
- `NutritionSummaryReview` now derives loading state from both consent and request-key mismatch, allowing the consent-disabled path to render static fallback copy with `aria-busy="false"` and no API call.
- Added/kept the `WeeklyReviewIsland` regression coverage for `range="last_30"` with AI summary consent disabled.
- Reconciled the Bug 5 records with the R1/security-added nutrition-summary route, consent toggle, context builder, consent/call-type migrations, and focused tests.

Focused verification:
- PASS: `pnpm test tests/unit/lib/aggregations/summary-context.test.ts tests/integration/ai-nutrition-summary.test.ts -- --reporter=verbose`.
- PASS: `pnpm test tests/components/dashboard/DailyEditorsNote.test.tsx tests/unit/components/dashboard/DailyEditorsNote.test.tsx tests/components/progress/WeeklyReviewIsland.period.test.tsx tests/unit/settings/page.test.tsx -- --reporter=verbose`.
- PASS: `pnpm vitest run tests/components/progress/WeeklyReviewIsland.period.test.tsx`.

Broad verification:
- PASS: `pnpm typecheck`.
- PASS: `pnpm lint` with 42 existing warnings / 0 errors.
- PASS: `pnpm build`; service worker and sourcemap were digest-unchanged and skipped.
- PASS: `pnpm test` rerun with longer timeout; 408 files passed / 18 skipped and 3160 tests passed / 99 skipped.

## E2E Blocker Addendum - 2026-05-18T23:54:00+07:00

### Issue

Authed dashboard/progress/settings routes crashed in Phase 7 when the test/pre-migration `profiles` schema did not yet include `ai_summary_opt_in`.

### Files Changed

- `lib/auth/orphan-profile-fence.ts`
- `tests/unit/lib/auth/orphan-profile-fence-status.test.ts`

### Fix

- The shared profile fence now retries only the specific Supabase `42703` missing-column case for optional `ai_summary_opt_in`.
- The fallback select removes only that column and returns the profile with `ai_summary_opt_in: false`.
- The AI nutrition summary consent gate therefore fails closed and does not call Gemini on pre-0025 schemas.
- Migration `0025_ai_summary_opt_in.sql` remains included for production schema application.

### Tests / Verification

- RED: new missing-column fence tests failed before the helper change.
- PASS: `pnpm vitest run --pool threads --maxWorkers 1 tests/unit/lib/auth/orphan-profile-fence-status.test.ts tests/integration/ai-nutrition-summary.test.ts tests/unit/settings/page.test.tsx tests/integration/progress-page-profile-lookup-guard.test.ts tests/integration/dashboard-page-onboarding-guard.test.ts` -> 5 files / 29 tests passed.
- PASS: `pnpm typecheck`
- PASS: `pnpm lint` -> 0 errors, 42 pre-existing warnings.
- PASS: focused Playwright golden-path/progress command -> 1 passed, 4 skipped.
