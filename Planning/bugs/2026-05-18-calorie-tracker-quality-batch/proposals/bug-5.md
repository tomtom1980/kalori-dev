# Bug 5: Real AI summaries for dashboard daily summary and progress

## Classification
known_fix

## Root Cause
The dashboard daily editor note is entirely deterministic: `DailyEditorsNote` calls `buildDailyEditorsNote()` and never reaches Gemini. The progress page has a partial weekly AI route, but it short-circuits to sparse copy for fewer than three logged days, uses only food entries, keys cache by week start rather than a data fingerprint, and falls back to deterministic period notes for daily/30-day ranges. That violates the agreed behavior: real AI should analyze logged food, water, weight, goals, profile, and selected range whenever at least one real logged item/day exists, with deterministic copy reserved for AI failure or truly empty states.

## Proposed Change (Diff Outline)
- Add a shared AI summary contract:
  - Extend `lib/ai/schemas.ts` with `NutritionSummaryResult` shaped like `{ body_markdown, bullets, caveats, generated_at, source, data_fingerprint }`.
  - Add a `v1_nutritionSummary` prompt in `lib/ai/prompts.ts` that receives separate structured parts for profile/goals, range, food totals/highlights, water totals, weight trend, and caveats. Preserve the existing prompt-injection posture: stored user strings stay data parts, sanitized before outbound prompt composition.
- Add a server-side summary data builder:
  - New helper under `lib/aggregations/summary-context.ts` or similar to build normalized dashboard-day and progress-range contexts from authenticated Supabase reads.
  - Include food entries/items, water logs, weight logs/latest weight, goal fields, timezone, selected range/start/end, and profile fields that affect interpretation.
  - Compute a stable SHA-256 `data_fingerprint` from sorted normalized JSON. Include meals, water, weight, goals, profile, range, and timezone in the fingerprint.
- Add or replace the AI route:
  - Prefer a new `app/api/ai/nutrition-summary/route.ts` instead of overloading the week-specific endpoint.
  - Body: `{ client_id, scope: "dashboard-day" | "progress-range", day?: YYYY-MM-DD, range?: { preset: "last_7" | "last_30" | "custom"; start_on: YYYY-MM-DD; end_on: YYYY-MM-DD } }`.
  - The route must derive user id from auth, validate dates server-side, fetch data server-side, compute fingerprint server-side, check `ai_response_cache` by `callType + userId + normalizedInput`, call Gemini on misses, log exactly one `ai_call_log` row, and return deterministic fallback only on empty context or AI failure.
  - If adding `call_type = "nutrition-summary"`, add a migration extending the `ai_call_log` and `ai_response_cache` check constraints plus TypeScript unions in `lib/ai/cache.ts` and `lib/ai/cost-log.ts`.
- Replace dashboard deterministic note with an AI-backed client island:
  - Change `components/dashboard/DailyEditorsNote.tsx` to render an AI summary island using the shared `EditorsNote`/weekly-review visual language.
  - First load shows a skeleton; subsequent refreshes keep the previous summary visible and set a subtle `aria-busy`/updating indicator.
  - Keep `lib/dashboard/daily-editors-note.ts` only as the deterministic empty/error fallback, or rename it to make fallback-only intent explicit.
- Replace progress period notes with the same AI summary surface:
  - Update `app/(app)/progress/_components/weekly-review-island.tsx` or replace it with a more accurately named summary island.
  - Stop using the `<3 distinct days` sparse short-circuit when there is any real logged food/water/weight item in range. For sparse-but-nonempty ranges, call Gemini with caveats and ask for useful, bounded recommendations.
  - Preserve old content while a selected-range/fingerprint refresh is in flight.
- Cache/fingerprint behavior:
  - Cache normalized input should be `scope + start_on + end_on + data_fingerprint`, not just week start or preset.
  - Continue route-level `client_id` replay protection, but do not let replay return a payload for a different fingerprint.
  - `weekly_reviews` is keyed only by `(user_id, week_start_on)` and should not be the primary cache for custom ranges or dashboard-day summaries unless the schema is expanded. Prefer `ai_response_cache`.
- Empty/failure behavior:
  - Empty means no food entries, no water logs, and no weight logs in the requested scope. Only then show deterministic "nothing logged" style copy.
  - AI failure returns deterministic fallback with `source: "fallback"` and preserves the previous client-visible summary when possible.

## Files Affected
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\api\ai\nutrition-summary\route.ts` (new)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\dashboard\page.tsx`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\dashboard\DailyEditorsNote.tsx`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\dashboard\daily-editors-note.ts`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\progress\_components\weekly-review-island.tsx`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\charts\WeeklyReviewCore.tsx`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\ai\prompts.ts`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\ai\schemas.ts`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\ai\cache.ts`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\ai\cost-log.ts`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\aggregations\summary-context.ts` (new)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\supabase\migrations\0024_nutrition_summary_call_type.sql` (new, if using a new call type)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\integration\ai-nutrition-summary.test.ts` (new)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\dashboard\DailyEditorsNote.test.tsx`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\progress\WeeklyReviewCore.test.tsx`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\progress\WeeklyReviewIsland.period.test.tsx`

## TDD Required
yes - this changes AI route behavior, cache keys, sparse-data semantics, and visible dashboard/progress UI state.

## Test Approach
- Add route tests for `POST /api/ai/nutrition-summary`:
  - one food entry in range calls Gemini and does not return `sparse_data` / "not enough items logged";
  - water-only and weight-only ranges call Gemini with caveats if they are real logged data;
  - empty ranges return deterministic fallback without Gemini;
  - cache hit uses `scope + date range + data_fingerprint`;
  - changing food, water, weight, profile goal fields, or selected range changes the fingerprint and bypasses the old cache;
  - Gemini failure returns fallback and still writes exactly one `ai_call_log` row;
  - stored item names are sanitized before prompt composition.
- Add schema/prompt tests:
  - `NutritionSummaryResult` rejects missing body and strips control chars;
  - prompt includes goals, water, weight, date range, and logged-data caveats as separate parts.
- Update dashboard component tests:
  - first load shows a skeleton;
  - populated response renders body/bullets;
  - refresh keeps previous summary visible and marks the surface busy/updating.
- Update progress component tests:
  - daily, last-7, last-30, and custom nonempty ranges request AI summary;
  - sparse-but-nonempty response never renders "Too little logged" / "not enough";
  - empty range still renders deterministic empty copy.
- Run targeted suites:
  - `pnpm vitest run tests/integration/ai-nutrition-summary.test.ts tests/components/dashboard/DailyEditorsNote.test.tsx tests/components/progress/WeeklyReviewCore.test.tsx tests/components/progress/WeeklyReviewIsland.period.test.tsx`
  - plus existing `tests/integration/ai-weekly-review.test.ts` if the old route remains.

## Risk Assessment
high - the correct fix crosses AI route contracts, database check constraints, cache semantics, and two user-facing surfaces. It also changes historical sparse-data behavior that existing tests currently pin.

## Regression Sweep Needed
- AI call logging and idempotency: `ai_call_log`, `ai_response_cache`, `client_id` replay.
- Prompt injection boundaries for stored food names.
- Progress page streaming and hydration.
- Dashboard accessibility and empty-state rendering.
- Export/account-delete paths that read `weekly_reviews` should remain compatible if the old table stays in use.
- Cache invalidation for entries, water, weight, profile, and library mutations.

## UI Touching
true - dashboard daily editor note and progress editor/weekly review surface. Web UI guidance: this is a dashboard/editorial summary surface, so keep the existing restrained Ledger card treatment; if animating update state, use CSS opacity only per the web guide performance table, not a new animation dependency.

## Open Questions
- Should the old `/api/ai/weekly-review` route remain for backward compatibility while the UI moves to `/api/ai/nutrition-summary`, or should implementation migrate it fully?
- Is adding a new `nutrition-summary` AI call type/migration acceptable in this bug batch, or should we temporarily reuse `weekly-review` in `ai_call_log` to avoid schema churn?
- For "profile" in the fingerprint, which fields are user-visible enough to include beyond goals/timezone/unit preference: age, bio sex, activity level, target mode, goal pace, current/goal weight?
- Stop flag: proposed source touch count is greater than 5 files, so implementation should be explicitly approved as a cross-cutting fix before Phase 3.
