# Round 1 Substitute Code Review

Batch: `2026-05-18-calorie-tracker-quality-batch`
Reviewer: Codex substitute review
Scope: current working tree diff for approved Bugs 1-12, including untracked batch files and staged `Planning` to `planning` case-only renames. Generated `.next` output was not reviewed. Tracked `public/sw.js` was treated as a generated artifact and reviewed only for deployment risk.

## Summary

Not clean. I found three Critical findings, four Improvements, and two Minor findings.

The highest-risk defects are in the new AI nutrition summary path: the context builder buckets food entries by UTC date instead of user timezone, ignores Supabase query errors, and the implementation/migration files are still untracked in the current status. Those are production-blocking until addressed or explicitly resolved before commit/deploy.

## Critical

### C1 - Food entries are bucketed by UTC date inside user-timezone summaries

File refs:
- `lib/aggregations/summary-context.ts:217`
- `lib/aggregations/summary-context.ts:219`
- `lib/aggregations/summary-context.ts:242`
- `lib/aggregations/summary-context.ts:247`

`buildNutritionSummaryContext()` queries food rows with user-timezone UTC bounds, but `aggregateFood()` assigns each row to `row.logged_at.slice(0, 10)`. That is the UTC calendar day, not the user's local day. For users outside UTC, especially this project's configured Asia/Bangkok context, entries near local midnight can be included by the query but dropped from all `daily` buckets because their UTC date is not in the local `days` list.

Impact:
- Dashboard-day AI summaries can omit real meals from the requested local day.
- Progress-range summaries can undercount daily totals/highlights.
- `food.entry_count` still uses `rows.length`, so `is_empty` can be false while prompt food totals/daily rows are empty.
- Fingerprints and cache entries can be generated for incorrect context, then reused.

Test gap:
- `tests/integration/ai-nutrition-summary.test.ts` mocks `buildNutritionSummaryContext()` instead of exercising the real builder.
- There is no timezone-boundary test proving an entry such as `2026-05-17T18:30:00.000Z` counts toward `2026-05-18` in `Asia/Bangkok`.

Expected fix:
- Bucket food with `userTzDayFrom(row.logged_at, timezone)` or equivalent, matching existing dashboard/progress aggregation patterns.
- Add a direct builder test covering non-UTC timezone boundaries and cache fingerprint changes.

### C2 - Supabase read errors are silently treated as empty or partial nutrition data

File refs:
- `lib/aggregations/summary-context.ts:400`
- `lib/aggregations/summary-context.ts:401`
- `lib/aggregations/summary-context.ts:406`
- `lib/aggregations/summary-context.ts:412`
- `lib/aggregations/summary-context.ts:420`
- `app/api/ai/nutrition-summary/route.ts:189`
- `app/api/ai/nutrition-summary/route.ts:222`

The summary context builder destructures only `data` from the three Supabase queries and ignores each query's `error`. Any food, water, or weight query failure is converted into `[]` and then treated as valid empty or partial context. The route may then return an "empty" fallback or call Gemini with incomplete data.

Impact:
- DB/schema/RLS/network failures become misleading user-facing summaries.
- Partial reads can be cached and logged as successful nutrition-summary calls.
- Production incidents lose the signal needed for diagnosis because no exception is thrown or captured.

Expected fix:
- Capture and handle each query error explicitly.
- Prefer throwing a typed `nutrition_summary_context_fetch_failed` error so the route uses the error fallback without cache pollution, or return a structured failure that is never cached as valid data.
- Add tests where food succeeds but water/weight fails, and where food fails. These should not produce a normal AI prompt from partial context.

### C3 - New implementation, tests, and migration are untracked in current status

File refs:
- `app/api/ai/nutrition-summary/route.ts`
- `components/charts/NutritionSummaryReview.tsx`
- `lib/aggregations/summary-context.ts`
- `supabase/migrations/0024_nutrition_summary_call_type.sql`
- `tests/components/dashboard/DailyEditorsNote.test.tsx`
- `tests/integration/ai-nutrition-summary.test.ts`
- `tests/unit/lib/ai/nutrition-summary.test.ts`

`git status --short` shows the route, shared component, summary builder, migration, and related tests as untracked. `git diff --stat` does not include these files, so a commit based only on tracked/staged diff would omit the core Bug 5 implementation and the production migration.

Impact:
- Production can deploy UI code that fetches `/api/ai/nutrition-summary` without the route.
- Production can deploy the route without the migration if staging is incomplete, causing check-constraint failures for `nutrition-summary`.
- Review and final diff statistics can understate the actual blast radius.

Expected fix:
- Stage or otherwise explicitly include these files before any final commit/merge.
- Re-run `git diff --stat --cached` or equivalent after staging to confirm the review/deploy diff includes them.

## Improvements

### I1 - Reusing a client_id with changed nutrition-summary input loses cost-log visibility

File refs:
- `app/api/ai/nutrition-summary/route.ts:183`
- `app/api/ai/nutrition-summary/route.ts:184`
- `app/api/ai/nutrition-summary/route.ts:171`
- `app/api/ai/nutrition-summary/route.ts:179`
- `lib/ai/cost-log.ts:61`
- `lib/ai/cost-log.ts:67`

The route only replays when the prior call type and input hash match. If the same `client_id` is reused with a changed range/fingerprint, the request falls through, can call Gemini, and then `logAICall()` inserts another row with the same `(user_id, client_id)`. The DB unique violation is swallowed as benign at `cost-log.ts:67`, so the second logical AI call can be unlogged.

The current UI mints a fresh client id per fetch, which reduces exposure. The API contract still accepts client ids, and retries or custom callers can hit this.

Expected fix:
- Treat same-client-id/different-input as a 409/idempotency conflict, or require the route to mint/log under a new id before calling Gemini.
- Add a route test for "same client_id, different fingerprint" that proves no unlogged Gemini call occurs.

### I2 - Nutrition-summary accepts future days/ranges even though progress UI rejects them

File refs:
- `app/api/ai/nutrition-summary/route.ts:37`
- `app/api/ai/nutrition-summary/route.ts:45`
- `app/api/ai/nutrition-summary/route.ts:47`
- `app/api/ai/nutrition-summary/route.ts:55`

The API validates ISO shape, ordering, and max length, but it does not reject `day`, `start_on`, or `end_on` in the future. The progress toolbar blocks future custom end dates, so the server route has weaker validation than the UI.

Impact:
- Crafted clients can create cache/log rows for future ranges.
- Future empty fallbacks can be shown or cached as if they were legitimate selected records.

Expected fix:
- Apply server-side `end_on <= today in user timezone` and dashboard `day <= today in user timezone` after profile timezone is known.
- Add direct route tests for future dashboard day and future progress range.

### I3 - Custom progress date inputs can go stale after URL-driven range changes

File refs:
- `app/(app)/progress/_components/ProgressRangeToolbar.tsx:37`
- `app/(app)/progress/_components/ProgressRangeToolbar.tsx:38`
- `app/(app)/progress/_components/ProgressRangeToolbar.tsx:43`
- `app/(app)/progress/_components/ProgressRangeToolbar.tsx:52`
- `app/(app)/progress/_components/ProgressRangeToolbar.tsx:53`

The toolbar initializes `start` and `end` from `customStart`/`customEnd` once, but it does not sync local state when props change due to browser back/forward, external links, or server redirects. `hrefFor('custom')` also prefers `customStart/customEnd` over local edits. That can leave the custom inputs and pending-range settlement out of sync with the actual URL.

Expected fix:
- Add an effect that updates local `start/end` when `customStart/customEnd/today` props change and no local edit is pending.
- Add a test for navigating from one custom URL to another in the same mounted toolbar.

### I4 - Heatmap persistent popup uses `role="dialog"` without focus management

File refs:
- `components/charts/HeatmapInteractive.tsx:414`
- `components/charts/HeatmapInteractive.tsx:417`
- `components/charts/HeatmapInteractive.tsx:434`
- `components/charts/HeatmapInteractive.tsx:446`

The persistent detail popup is rendered as `role="dialog"`, but opening it does not move focus into the popup or to the close button. Keyboard users get Escape support and a live region update, but the dialog semantics imply a focusable dialog interaction that is not implemented.

Expected fix:
- Either manage focus on open and restore it on close, or use non-dialog semantics for the persistent detail if the intended keyboard contract is "cell remains focused, Escape closes, live region announces".
- Add a keyboard/a11y test for Enter/Space open, focus behavior, Escape close, and focus return.

## Minor

### M1 - TimeEditor comment still documents a 2-minute server grace buffer

File refs:
- `app/(app)/log/_components/Confirmation/TimeEditor.tsx:89`
- `app/(app)/log/_components/Confirmation/TimeEditor.tsx:90`
- `app/api/entries/save/route.ts:151`
- `app/api/entries/save/route.ts:159`
- `app/api/library/[id]/log-now/route.ts:180`
- `app/api/library/[id]/log-now/route.ts:184`

The API routes now enforce a 30-second future skew, but the TimeEditor comment still says the server has a 2-minute grace buffer. This is documentation drift, not a runtime bug.

### M2 - Tracked generated `public/sw.js` churn should be explicitly accepted or regenerated consistently

File refs:
- `public/sw.js:1`
- `scripts/build-sw.mjs:43`
- `scripts/build-sw.mjs:65`

`public/sw.js` changed by `1775` deletions and `3` insertions because the build output is now minified. The final build reported success, and this may be intended generated output. It is still a large tracked artifact in the review diff and should be explicitly accepted before commit. If source maps are expected to match this artifact, verify `public/sw.js.map` was generated under the same build mode.

## Verification Observed

From batch docs:
- Final `pnpm test` passed: `407 passed | 18 skipped`, `3145 passed | 99 skipped`.
- `pnpm typecheck` passed.
- `pnpm lint` passed with `42` warnings and `0` errors.
- `pnpm build` passed.
- `git diff --check` passed with line-ending warnings only.

Residual review concern:
- Passing tests do not cover the real nutrition-summary builder's non-UTC bucketing or query-error paths because the new route tests mock the builder.
