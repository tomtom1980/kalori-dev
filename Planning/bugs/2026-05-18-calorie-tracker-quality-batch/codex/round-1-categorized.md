# Round 1 Categorized Findings

## Critical

- C1 - `lib/aggregations/summary-context.ts:217`: food summary buckets use `logged_at.slice(0, 10)` instead of user-timezone day conversion, causing local-day meals near UTC midnight to be dropped from AI summaries/fingerprints/cache.
- C2 - `lib/aggregations/summary-context.ts:400`: Supabase errors from food/water/weight reads are ignored, so DB/RLS/schema failures can become empty or partial AI summaries.
- C3 - Deployment blocker: seven batch files are untracked, including `app/api/ai/nutrition-summary/route.ts`, `lib/aggregations/summary-context.ts`, and `supabase/migrations/0024_nutrition_summary_call_type.sql`.

## Improvement

- I1 - `app/api/ai/nutrition-summary/route.ts:183`: same `client_id` with changed input can call Gemini while `ai_call_log` duplicate insert is swallowed, losing cost-log visibility.
- I2 - `app/api/ai/nutrition-summary/route.ts:37`: the nutrition-summary API does not reject future dashboard days or future progress ranges server-side.
- I3 - `app/(app)/progress/_components/ProgressRangeToolbar.tsx:37`: custom date input state is initialized from props but not synced when URL props change.
- I4 - `components/charts/HeatmapInteractive.tsx:417`: persistent heatmap detail popup uses `role="dialog"` without focus management.

## Minor

- M1 - `app/(app)/log/_components/Confirmation/TimeEditor.tsx:89`: comment still describes a 2-minute server grace buffer while routes enforce 30 seconds.
- M2 - `public/sw.js:1`: tracked generated service-worker churn is large and should be explicitly accepted or regenerated consistently with its sourcemap.
