# Security Review - Bugfix 2026-05-18 Calorie Tracker Quality Batch

Status: BLOCKED - security/cost-control fixes required before merge/deploy.

Reviewed current working-tree diff with emphasis on:
- `app/api/ai/nutrition-summary/route.ts`
- AI response cache and cost logging
- Supabase migration/type updates
- progress/date-range validation
- future food-log enforcement
- desktop/mobile photo upload behavior
- settings export navigation
- auth/user scoping, prompt/data leakage, replay/idempotency, quota controls, RLS, PII

## Blocking Findings

### HIGH - Reused `client_id` can trigger unlogged Gemini calls on changed input

Files:
- `app/api/ai/nutrition-summary/route.ts:183`
- `app/api/ai/nutrition-summary/route.ts:243`
- `lib/ai/cost-log.ts:61`
- `lib/ai/cost-log.ts:63`

The new nutrition-summary route checks `findPriorCall({ userId, clientId })`, but only short-circuits when the prior row is `nutrition-summary` and has the same `inputHash`:

- same `client_id` + same hash + cache hit: replay returns cache
- same `client_id` + different hash: falls through to cache/Gemini
- same `client_id` + prior different AI call type: also falls through
- same `client_id` + same hash but cache expired/missing: also falls through

After fallthrough, `logOnce()` writes `ai_call_log` with the reused `client_id`. The DB unique index on `(user_id, client_id)` returns `23505`, and `logAICall()` explicitly swallows that as benign. Result: an authenticated caller can reuse one UUID, vary `day`/`range`, and cause fresh Gemini calls that are not recorded in `ai_call_log`. Any quota or cost analytics backed by `ai_call_log` can be bypassed.

Fix required:
- If `prior` exists and `prior.callType !== 'nutrition-summary'`, return 409 before Gemini.
- If `prior.callType === 'nutrition-summary'` but `prior.inputHash !== inputHash`, return 409 before Gemini.
- If `prior.inputHash === inputHash` but cache is missing/expired, do not call Gemini under the same `client_id` unless a durable logging strategy exists; require a fresh `client_id` or return a retry/conflict response.
- Add integration coverage for reused `client_id` with changed range/hash and with prior non-nutrition call type.

### HIGH - New call type depends on an untracked migration; missing deploy causes paid, unlogged failures

Files:
- `supabase/migrations/0024_nutrition_summary_call_type.sql`
- `app/api/ai/nutrition-summary/route.ts:237`
- `app/api/ai/nutrition-summary/route.ts:249`
- `lib/ai/cost-log.ts:61`

`git status` shows `supabase/migrations/0024_nutrition_summary_call_type.sql` as untracked. The route uses the new `nutrition-summary` call type for both cache writes and cost-log writes. If application code reaches production without this migration applied, the happy path calls Gemini first, then `cacheWrite()` fails on the DB check constraint. The catch block returns fallback, then `logOnce()` also attempts `call_type = 'nutrition-summary'`; that insert fails too and is swallowed by `logAICall()`.

Impact: users get fallback responses, cache never fills, and paid Gemini calls can happen without usable cost log rows.

Fix required:
- Ensure migration `0024_nutrition_summary_call_type.sql` is committed/staged with this batch and applied before the route is reachable.
- Prefer a deploy guard/feature flag or preflight DB compatibility check so the route cannot call Gemini if the DB cannot accept `nutrition-summary`.
- Add a regression test for migration-not-applied behavior if the route remains live before migration certainty.

### HIGH - Automatic AI summaries send sensitive nutrition/weight context to Gemini on page load

Files:
- `components/dashboard/DailyEditorsNote.tsx:101`
- `components/charts/NutritionSummaryReview.tsx:45`
- `lib/aggregations/summary-context.ts:40`
- `lib/ai/prompts.ts:426`

The new client components automatically call `/api/ai/nutrition-summary` on dashboard/progress render. The server prompt context includes food highlights, calorie/macronutrient totals, water logs, weight logs, current weight, goal weight, activity level, goal pace, target mode, and timezone. This is health/fitness PII sent to a third-party AI provider without an explicit user action in these components.

This may be acceptable only if the product already has clear consent/privacy coverage for automatic AI processing of historical food, water, and weight data. It is materially broader than user-initiated food/photo parsing.

Fix required:
- Confirm existing privacy/consent covers passive nutrition summaries, or gate these calls behind an explicit AI-summary opt-in.
- Consider a settings toggle and/or only sending the minimum context needed for the summary.

## Non-Blocking Findings

### MEDIUM - API date-range validation allows future dashboard days and future progress ranges

Files:
- `app/api/ai/nutrition-summary/route.ts:37`
- `app/api/ai/nutrition-summary/route.ts:47`
- `lib/aggregations/progress.ts:383`

The progress UI/parser rejects future custom ranges, but the API route only validates ISO shape, order, and max 365 days. Direct authenticated calls can request `dashboard-day` in the future or `progress-range.end_on` in the future. Empty future ranges avoid Gemini, but they still create cost-log/cache noise; if future-dated water/weight rows exist, this can also send future data into AI summaries.

Recommendation:
- Derive "today" in the user's timezone and reject `day > today` and `range.end_on > today` server-side.
- Mirror the existing progress parser contract at the API boundary.

### MEDIUM - No explicit nutrition-summary quota/rate limit on uncached AI misses

Files:
- `app/api/ai/nutrition-summary/route.ts:195`
- `lib/ai/image-analysis-quota.ts:10`

Cache prevents exact-repeat cost, but an authenticated caller can generate many distinct custom windows up to 365 days. Unlike image analysis, this route has no daily/monthly quota check before Gemini. This is less severe than the `client_id` logging bypass above, but it still leaves a broad cost-amplification surface.

Recommendation:
- Add a quota window for uncached `nutrition-summary` calls using `ai_call_log.cached_flag = false`.
- Count only successful non-cache AI calls, and ensure the idempotency-conflict fix above lands first so the quota cannot be bypassed.

### LOW - Nutrition-summary body accepts extra opposite-scope fields

Files:
- `app/api/ai/nutrition-summary/route.ts:47`

`BodySchema` requires `day` for `dashboard-day` and `range` for `progress-range`, but does not reject `range` on dashboard requests or `day` on progress requests. The implementation ignores the irrelevant field, so I did not find a direct security impact.

Recommendation:
- Tighten schema refinement to require exactly the fields for the selected scope.

## Clean Areas

- Auth boundary: `requireProfileOrJson401()` and `rejectIfDeletingOrUnavailable()` run before aggregation/Gemini in the new route.
- User scoping: `buildNutritionSummaryContext()` filters `food_entries`, `water_log`, and `weight_log` by `user_id`; cache lookup also filters by `user_id` and hashes `userId` into the cache key.
- RLS assumptions: the new migration does not add user-facing policies to `ai_response_cache` or `ai_call_log`; existing service-role-only design remains intact.
- Prompt injection: food highlights and caveats are sanitized before prompt composition; output strings are size-capped and control-character stripped.
- Client rendering: AI text is rendered as React text, not via `dangerouslySetInnerHTML`; I did not find an XSS path in `EditorsNote` or `WeeklyReviewCore`.
- Future food-log enforcement: `/api/entries/save` and `/api/library/[id]/log-now` now reject `logged_at` more than 30 seconds in the future before fresh inserts; the replay ordering remains intentional.
- Photo upload behavior: the desktop/mobile change only switches camera capture vs upload input presentation; no new upload endpoint or client-side secret exposure was introduced.
- Settings export navigation: adding `#data-export` navigation and a section id does not expose additional data.

## Addendum - 2026-05-18T23:05:35+07:00 Recovery Review Fixes

Status: blocking security findings addressed in code; broad validation passed.

- Reused `client_id` logging bypass: fixed. `nutrition-summary` now returns 409 before Gemini and before `logAICall()` when a prior `client_id` belongs to another call type, has a different input hash, or has the same hash but no durable replay cache. Covered by `tests/integration/ai-nutrition-summary.test.ts`.
- Passive AI summary privacy: fixed. The route requires `profiles.ai_summary_opt_in === true`, dashboard/progress server pages pass the profile flag, settings exposes an explicit toggle through the existing profile-save pattern, and the client components now default to fail-closed unless consent is explicitly passed.
- Future AI summary ranges: fixed. The route derives today in the user's timezone and rejects future dashboard days or progress `end_on` values before context reads and before Gemini. Covered by route integration tests.
- Supabase aggregation read failures: fixed. `buildNutritionSummaryContext()` throws `NutritionSummaryContextReadError` for `food_entries`, `water_log`, and `weight_log` query errors instead of treating failed reads as empty data. Covered by unit tests.
- Timezone local-day food bucketing: fixed. Food entries are assigned with `userTzDayFrom(logged_at, timezone)` before inclusion and fingerprinting. Covered by the Asia/Bangkok UTC-midnight regression test.
- Deployment/migration risk: still requires staging/applying new migration files before deploy. Exact untracked files are documented in `codex/fixes-r1-review.md`; no broad `git add` was run.
- `public/sw.js`: remains generated tracked churn without a matching `public/sw.js.map` change in git status. Treat as not part of the review-fix staging set unless regenerated intentionally.

Focused verification passed:
- `pnpm test tests/unit/lib/aggregations/summary-context.test.ts tests/integration/ai-nutrition-summary.test.ts -- --reporter=verbose`
- `pnpm test tests/components/progress/ProgressRangeToolbar.test.tsx tests/components/progress/MicronutrientHeatmap.test.tsx -- --reporter=verbose`
- `pnpm test tests/components/dashboard/DailyEditorsNote.test.tsx tests/unit/components/dashboard/DailyEditorsNote.test.tsx tests/components/progress/WeeklyReviewIsland.period.test.tsx tests/unit/settings/page.test.tsx -- --reporter=verbose`
- `pnpm test tests/unit/log/confirmation-time-editor.test.tsx -- --reporter=verbose`

Broad verification passed:
- `pnpm typecheck`
- `pnpm lint` (42 existing warnings, 0 errors)
- `pnpm build` (`public/sw.js` and `public/sw.js.map` digest-unchanged/skipped)
- `pnpm test` rerun with longer timeout (408 files passed / 18 skipped; 3160 tests passed / 99 skipped)

## Round 2 Addendum - 2026-05-18T23:26:09+07:00 Security Re-Review

Status: BLOCKED on release packaging only. No remaining in-code security blocker found in the reviewed nutrition-summary, consent, auth scoping, future-range validation, RLS, or prompt/data-leakage paths.

### Blocking Finding

#### HIGH - Migration files required by the security fixes remain untracked

Files:
- `supabase/migrations/0024_nutrition_summary_call_type.sql`
- `supabase/migrations/0025_ai_summary_opt_in.sql`
- `lib/database.types.ts`
- `app/api/ai/nutrition-summary/route.ts`
- `app/(app)/dashboard/page.tsx`
- `app/(app)/progress/page.tsx`
- `app/(app)/settings/page.tsx`
- `app/api/profile/save/route.ts`

`git status --porcelain` still reports migrations `0024_nutrition_summary_call_type.sql` and `0025_ai_summary_opt_in.sql` as untracked, while the current tracked code and generated database types assume both are part of the release.

Impact:
- Without `0024`, the new `nutrition-summary` call type can fail cache/cost-log writes after Gemini work has already been performed.
- Without `0025`, server profile selects and the settings/profile-save consent path can fail because `profiles.ai_summary_opt_in` does not exist.
- Because these files are untracked, a normal staged diff/commit can accidentally ship dependent app code without the required database changes.

Required before merge/deploy:
- Explicitly stage/commit both migration files with this batch.
- Apply `0024` and `0025` before or atomically with the app release that references `nutrition-summary` and `profiles.ai_summary_opt_in`.

### Clean Re-Review Areas

- Cost/idempotency logging: `app/api/ai/nutrition-summary/route.ts` now rejects reused `client_id` conflicts and same-hash replay-without-cache with 409 before Gemini and before `logAICall()`. Cache hits, empty fallbacks, Gemini success, and Gemini fallback paths each log once for first-time requests.
- Quota/cost control: no remaining logging bypass was found. The pre-existing lack of an explicit nutrition-summary quota remains a non-blocking cost-control follow-up unless product policy requires quota parity with image analysis before launch.
- AI summary privacy gate: the route fails closed with `ai_summary_consent_required` before context reads/Gemini when `profiles.ai_summary_opt_in !== true`; dashboard/progress pass the server-read flag; settings exposes an explicit profile-owned toggle.
- Auth/user scoping: `requireProfileOrJson401()` and `rejectIfDeletingOrUnavailable()` run before data aggregation/Gemini. Summary context queries filter `food_entries`, `water_log`, and `weight_log` by `user_id`; cache lookup/replay also filters by `user_id`.
- Server future-range validation: the route derives today from the normalized user timezone and rejects future dashboard days and future progress `end_on` before context reads/Gemini.
- Supabase RLS assumptions: the new migrations do not add user-facing policies to `ai_response_cache` or `ai_call_log`; existing service-role-only cache/log access remains consistent. `profiles.ai_summary_opt_in` is covered by the existing own-profile RLS policies.
- Prompt/data leakage: summary context is built from the authenticated user's rows only, food highlights/caveats are sanitized before prompt composition, and AI output is rendered as React text rather than HTML.

Round 2 tests were not rerun during this re-review; this pass was a static security review of the current working tree and prior-fix evidence.

## Addendum - AI Summary Opt-In Schema Compatibility - 2026-05-18T23:54:00+07:00

Status: no new security issue found.

- The compatibility path is intentionally narrow: it matches only Supabase `42703` errors whose message names missing `ai_summary_opt_in`.
- On that exact pre-0025 schema condition, the fence retries the same owned `profiles` lookup without only that optional column and injects `ai_summary_opt_in: false`.
- This preserves fail-closed consent: dashboard/progress/settings can render, but AI nutrition summaries are not called unless the real column is present and true.
- Other profile lookup errors still use the existing fail-closed page/API behavior and are not swallowed.
- Production migration `supabase/migrations/0025_ai_summary_opt_in.sql` remains required and present.

Verification:
- `pnpm vitest run --pool threads --maxWorkers 1 tests/unit/lib/auth/orphan-profile-fence-status.test.ts tests/integration/ai-nutrition-summary.test.ts tests/unit/settings/page.test.tsx tests/integration/progress-page-profile-lookup-guard.test.ts tests/integration/dashboard-page-onboarding-guard.test.ts` -> 5 files / 29 tests passed.
- `pnpm typecheck` -> passed.
- `pnpm lint` -> 0 errors, 42 pre-existing warnings.
- Focused Playwright golden-path/progress -> 1 passed, 4 skipped.
