# Round 1 Fix: Quota Artifacts and Library Hydration

## Findings

1. Bug 8 imports/tests referenced quota artifacts that were absent from disk:
   - `lib/ai/image-analysis-quota.ts`
   - `tests/unit/lib/ai/image-analysis-quota.test.ts`
   - `tests/unit/lib/ai/prompts-approx-grams.test.ts`
   - `supabase/migrations/0023_image_analysis_quota_call_type.sql`

2. `toLogLibraryItem` still dropped `nutrition.micros` and `nutrition.approxGrams`, so library re-log hydration could not carry the metadata that downstream code expected.

3. `LibraryList.tsx` contained a literal NUL byte in source, causing `rg` to treat it as binary.

## Fix

- Restored the missing quota helper, tests, and migration.
- Updated `toLogLibraryItem` to preserve `micros` and positive finite `approxGrams`.
- Replaced the literal NUL byte with the source escape `\u0000`.

## Verification

- `pnpm vitest run --pool threads --maxWorkers 1 tests/unit/lib/ai/image-analysis-quota.test.ts tests/unit/lib/ai/prompts-approx-grams.test.ts tests/unit/lib/library/sketch-pipeline.test.ts`
- `pnpm vitest run --pool threads --maxWorkers 1 tests/unit/library/to-log-library-item.test.ts tests/components/library-tab-continue-cta.test.tsx`
- Included in the full focused batch Vitest run: 21 files / 314 tests passed.
- `pnpm typecheck`
- focused `pnpm exec eslint ...`
- `git diff --check ...`
- NUL-byte byte scan: 0
