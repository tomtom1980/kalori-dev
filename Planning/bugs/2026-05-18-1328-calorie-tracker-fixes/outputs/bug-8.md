# Bug 8: Shared AI image analysis quota

## Files Changed
- `app/api/ai/vision/route.ts`
- `app/api/library/sketch/generate/route.ts`
- `app/api/library/sketch/backfill/route.ts`
- `app/api/library/create/route.ts`
- `app/api/entries/save/route.ts`
- `lib/ai/cost-log.ts`
- `lib/ai/image-analysis-quota.ts`
- `lib/library/sketch-enqueue.ts`
- `lib/library/sketch-pipeline.ts`
- `supabase/migrations/0023_image_analysis_quota_call_type.sql`
- `tests/integration/ai-vision.test.ts`
- `tests/unit/lib/ai/image-analysis-quota.test.ts`
- `tests/unit/lib/library/sketch-pipeline.test.ts`

## Tests Added/Modified
- Added shared quota rejection and cache-hit-free assertions in `tests/integration/ai-vision.test.ts`.
- Added shared quota helper coverage in `tests/unit/lib/ai/image-analysis-quota.test.ts`.
- Added sketch quota rejection and sketch `ai_call_log` insertion assertions in `tests/unit/lib/library/sketch-pipeline.test.ts`.

## Commands Run
- FAIL (expected RED): `pnpm vitest run --pool threads --maxWorkers 1 tests/integration/ai-vision.test.ts tests/unit/lib/library/sketch-pipeline.test.ts`
  - `ai-vision`: expected 429, received 200.
  - `sketch-pipeline`: expected quota failure, received `generated`.
- PASS: `pnpm vitest run --pool threads --maxWorkers 1 tests/integration/ai-vision.test.ts tests/unit/lib/library/sketch-pipeline.test.ts`
  - 2 files, 29 tests passed.
- PASS: `pnpm vitest run --pool threads --maxWorkers 1 tests/integration/ai-vision.test.ts tests/unit/lib/library/sketch-pipeline.test.ts tests/unit/lib/ai/image-analysis-quota.test.ts`
  - 3 files, 33 tests passed.
- PASS: `pnpm vitest run --pool threads --maxWorkers 1 tests/unit/api/library-sketch-generate.test.ts tests/unit/api/library-sketch-backfill.test.ts tests/unit/api/entries-save-sketch-enqueue.test.ts tests/unit/api/library-create.test.ts`
  - 4 files, 23 tests passed.
- PASS: `pnpm vitest run --pool threads --maxWorkers 1 tests/integration/ai-vision.test.ts tests/unit/lib/library/sketch-pipeline.test.ts tests/unit/lib/ai/image-analysis-quota.test.ts tests/unit/api/library-sketch-generate.test.ts tests/unit/api/library-sketch-backfill.test.ts tests/unit/api/entries-save-sketch-enqueue.test.ts tests/unit/api/library-create.test.ts`
  - 7 files, 56 tests passed.
- PASS: `pnpm exec eslint lib/ai/image-analysis-quota.ts lib/ai/cost-log.ts app/api/ai/vision/route.ts lib/library/sketch-pipeline.ts lib/library/sketch-enqueue.ts app/api/library/sketch/generate/route.ts app/api/library/sketch/backfill/route.ts app/api/library/create/route.ts app/api/entries/save/route.ts tests/integration/ai-vision.test.ts tests/unit/lib/library/sketch-pipeline.test.ts tests/unit/lib/ai/image-analysis-quota.test.ts`
- FAIL: `pnpm typecheck`
  - Blocked by unrelated in-progress files from other workers, including `components/charts/WeightTrajectoryLine.tsx`, `approxGrams` tests/schema work, micronutrient heatmap tests, and progress weight quick-add exports. No remaining typecheck errors referenced bug #8 files after the backfill route signature fix.

## Implementation Notes
- Added `getImageAnalysisQuota()` over service-role `ai_call_log`, counting only `cached_flag=false` rows with `call_type in ('vision', 'image-analysis-sketch')`.
- `/api/ai/vision` now checks quota after idempotency replay and cache-hit handling, so reused/cached vision results do not consume the shared quota.
- Sketch generation now checks the same quota before claiming a sketch attempt, before Gemini, and before upload. Exhausted quota returns user-facing copy `AI image analysis limit`.
- Real sketch model attempts write one `ai_call_log` row with `call_type='image-analysis-sketch'`; provider failures after the model call starts are also logged once.
- Added migration `0023_image_analysis_quota_call_type.sql` to widen the `ai_call_log.call_type` check constraint.

## Residual Risk
- Quota enforcement is server-side and user-scoped, but it is count-then-call rather than an atomic DB reservation. Highly parallel requests near the limit could overshoot by a small race window; closing that would require a stronger DB-side reservation/RPC design beyond the approved scope.
