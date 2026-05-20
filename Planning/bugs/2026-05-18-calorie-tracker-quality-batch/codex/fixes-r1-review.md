# Round 1 Review/Security Fixes - Recovery Worker

Date: 2026-05-18T23:05:35+07:00

## Partial Changes Found

- Review-fix work was already partially applied when recovery began.
- `summary-context.ts` already used `userTzDayFrom()` for food bucketing and threw `NutritionSummaryContextReadError` for Supabase query errors.
- `nutrition-summary` route already had consent gating, future-date rejection, strict opposite-scope body validation, and idempotency conflict handling.
- `ProgressRangeToolbar` already had the URL-derived custom input regression test, but implementation synced state by calling `setState` during render.
- `HeatmapInteractive` already had a persistent detail dialog with close-button focus and trigger focus restoration.
- `TimeEditor` comment had already been updated to the 30-second grace-buffer contract.
- `public/sw.js` remains modified generated output while `public/sw.js.map` is not modified; do not stage `public/sw.js` unless the service worker is intentionally regenerated with consistent generated artifacts.

## Fixes Completed

- `lib/aggregations/summary-context.ts`
  - Confirmed food summary buckets use the user's timezone local day instead of `logged_at.slice(0, 10)`.
  - Confirmed Supabase read errors for `food_entries`, `water_log`, and `weight_log` fail closed via `NutritionSummaryContextReadError`.
  - Added/kept regression coverage for non-UTC local-day inclusion and fingerprint generation.

- `app/api/ai/nutrition-summary/route.ts`
  - Confirmed reused `client_id` with a changed input hash returns 409 before Gemini and before cost logging.
  - Confirmed reused `client_id` from another AI call type returns 409 before Gemini and before cost logging.
  - Confirmed same-hash replay with missing durable cache returns 409 instead of making an unlogged Gemini call.
  - Confirmed future dashboard days and future progress ranges return 400 before context reads or Gemini.
  - Confirmed opposite-scope fields are rejected by schema refinement.

- AI summary consent/privacy
  - Existing settings/profile-save patterns were available and the partial worker had added `profiles.ai_summary_opt_in`.
  - Preserved that server-owned consent gate and made `DailyEditorsNote`, `NutritionSummaryReview`, and `WeeklyReviewIsland` fail closed by default unless pages explicitly pass `aiSummaryOptIn`.

- `app/(app)/progress/_components/ProgressRangeToolbar.tsx`
  - Replaced render-time custom state synchronization with derived URL-backed state.
  - Removed the intermediate `useEffect` sync attempt after lint rejected synchronous state updates in effects.
  - Preserved the regression test for URL-derived custom input prop changes.

- `components/charts/HeatmapInteractive.tsx`
  - Confirmed the persistent detail dialog focuses the close button on open, closes via X/outside click/Escape, and restores focus to the triggering heatmap cell.
  - Confirmed regression coverage.

- `app/(app)/log/_components/Confirmation/TimeEditor.tsx`
  - Confirmed stale 2-minute comment now says 30-second grace buffer.

## Exact Untracked Files

These core new files must be staged later with the batch. No broad `git add` was run.

- `app/(app)/settings/_components/AiSummaryConsentToggle.tsx`
- `app/api/ai/nutrition-summary/route.ts`
- `components/charts/NutritionSummaryReview.tsx`
- `lib/aggregations/summary-context.ts`
- `supabase/migrations/0024_nutrition_summary_call_type.sql`
- `supabase/migrations/0025_ai_summary_opt_in.sql`
- `tests/components/dashboard/DailyEditorsNote.test.tsx`
- `tests/integration/ai-nutrition-summary.test.ts`
- `tests/unit/lib/aggregations/summary-context.test.ts`
- `tests/unit/lib/ai/nutrition-summary.test.ts`

## Focused Verification

- PASS: `pnpm test tests/unit/lib/aggregations/summary-context.test.ts tests/integration/ai-nutrition-summary.test.ts -- --reporter=verbose`
  - 2 files passed, 16 tests passed.
- PASS: `pnpm test tests/components/progress/ProgressRangeToolbar.test.tsx tests/components/progress/MicronutrientHeatmap.test.tsx -- --reporter=verbose`
  - 2 files passed, 40 tests passed.
- PASS: `pnpm test tests/components/progress/ProgressRangeToolbar.test.tsx -- --reporter=verbose`
  - Rerun after the derived-state lint fix; 1 file passed, 13 tests passed.
- PASS: `pnpm test tests/components/dashboard/DailyEditorsNote.test.tsx tests/unit/components/dashboard/DailyEditorsNote.test.tsx tests/components/progress/WeeklyReviewIsland.period.test.tsx tests/unit/settings/page.test.tsx -- --reporter=verbose`
  - 4 files passed, 13 tests passed.
- PASS: `pnpm test tests/unit/log/confirmation-time-editor.test.tsx -- --reporter=verbose`
  - 1 file passed, 11 tests passed.

## Broad Verification

- PASS: `pnpm typecheck`.
- PASS: `pnpm lint`.
  - 42 existing warnings, 0 errors.
- PASS: `pnpm build`.
  - Next build passed.
  - `pnpm sw:build` reported `public/sw.js` and `public/sw.js.map` digest-unchanged and skipped both generated outputs.
- TIMEOUT: first `pnpm test` run hit the 5-minute harness timeout before returning a result.
- PASS: rerun `pnpm test` with a longer timeout.
  - 408 files passed, 18 skipped.
  - 3160 tests passed, 99 skipped.
  - Happy DOM printed `ECONNREFUSED :3000` and abort teardown noise after the passing summary; command exit code was 0.
