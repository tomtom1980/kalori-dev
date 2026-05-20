# Bug 8: Shared image AI quota across library sketch generation and dashboard vision recognition
## Classification
known_fix

## Root Cause
The existing 20/day and 100/month quota is implemented as a library-create quota in `lib/library/create-quota.ts`, counting `food_library_items.created_at`. That quota is enforced by `/api/library/create` and the save-to-library branch in `/api/entries/save`, but it is not an image-AI usage quota and does not count dashboard camera/upload recognition calls. Separately, `/api/ai/vision` logs `call_type='vision'` to `ai_call_log` but has no daily/monthly quota check, while the Gemini image sketch pipeline calls `callGeminiImage()` without writing `ai_call_log` at all. The result is split enforcement: users can consume image AI through vision and sketch generation without a shared server-side 20/day and 100/month image-AI limit.

## Proposed Change (Diff Outline)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\ai\cost-log.ts`: add an image-generation call type, preserving existing service-role-only logging and replay helpers.
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\supabase\migrations\<next>_image_ai_usage_quota.sql`: widen `ai_call_log.call_type` to include image generation, keeping RLS service-role-only.
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\ai\image-usage-quota.ts`: add shared quota windows and counters for image AI usage, counting `ai_call_log` rows for `vision` plus image generation over the user's timezone day/month; expose constants 20/day and 100/month.
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\api\ai\vision\route.ts`: before calling Gemini or returning cache-hit usage, enforce the shared image-AI quota server-side and return 429 when exhausted; log only admitted logical calls.
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\library\sketch-pipeline.ts`: before `callGeminiImage()`, enforce the same quota and log successful, failed, and provider-error image-generation attempts to `ai_call_log` exactly once per admitted attempt.

## Files Affected
C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\ai\cost-log.ts
C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\supabase\migrations\<next>_image_ai_usage_quota.sql
C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\ai\image-usage-quota.ts
C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\api\ai\vision\route.ts
C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\library\sketch-pipeline.ts

## TDD Required
yes - this is server-side quota/control-flow behavior touching paid AI calls and abuse prevention.

## Test Approach
- Add/modify vision route tests to seed mocked `ai_call_log` counts and assert `/api/ai/vision` returns 429 before Gemini when the shared daily or monthly image-AI limit is exhausted.
- Add sketch-pipeline tests proving exhausted quota skips the Gemini image call and records a quota failure on the library row without uploading or marking `thumbnail_kind='sketch'`.
- Add sketch-pipeline tests proving admitted image-generation attempts write an `ai_call_log` row with the new call type.
- Add quota-helper unit tests for user-timezone day/month windows and combined counting of `vision` plus image-generation rows.
- Add migration/schema tests for the widened `ai_call_log.call_type` check constraint.

## Risk Assessment
medium - the fix touches paid AI call admission and background sketch generation; mistakes could either over-block legitimate use or fail open and allow abuse.

## Regression Sweep Needed
- `/api/ai/vision` happy path, cache-hit path, fallback path, oversized image path, and idempotency replay path.
- Library manual create and entries save-to-library flows that enqueue sketch generation.
- `/api/library/sketch/generate` and `/api/library/sketch/backfill` behavior when quota is available, exhausted, and when rows are already generated/photo/max-retry.
- Supabase RLS/service-role assumptions for `ai_call_log`.
- Existing AI call-log insertion/idempotency integration tests.

## UI Touching
false - the proposed fix can be enforced server-side using existing error/fallback surfaces. A later UX improvement could add a specific quota-exhausted message in `SnapTab`, but it is not required for server-side correctness.

## Open Questions
- Should cache hits for `/api/ai/vision` count against the shared image-AI quota? The current AI logging records cache hits as `cached_flag=true`; for cost control they should probably not consume paid-image quota, but for anti-spam/rate limiting they might.
- Should failed Gemini image-generation attempts count against quota? They may still consume provider quota/cost, so the proposal counts admitted attempts once they pass the quota gate.
- Should the existing `/api/library/quota` response be renamed or left as library-create quota? It currently reports library item creation capacity, not shared image-AI usage.

## User Decision
- Cache hits and reused image AI results must not count against the shared daily/monthly image quota. Only real AI model calls consume quota; cache-hit behavior may still be logged as telemetry.
- User-facing quota copy should be `AI image analysis limit`. Internal implementation naming should align to image analysis rather than library quota, for example `image_analysis_daily_limit` and `image_analysis_monthly_limit` if names are needed.
