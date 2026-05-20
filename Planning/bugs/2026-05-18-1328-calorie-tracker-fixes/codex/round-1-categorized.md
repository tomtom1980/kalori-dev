# Codex Review Round 1 Categorized Findings

## Counts

| Severity | Count | Fixed in R1 | Pending |
|---|---:|---:|---:|
| Critical | 2 | 2 | 0 |
| Improvement | 2 | 2 | 0 |
| Minor | 1 | 0 | 1 |

## Critical

### C1: Bug 2 was not implemented

Status: fixed

Evidence:
- `state.md` still had bug 2 as `approved` with empty `files_touched` and `tests_added`.
- `outputs/bug-2.md` was missing.
- `TimeEditor` still used `now + 5min` as the native input max.
- The confirmation save path surfaced generic `400: Bad Request` for server `logged_at_future` responses.

Fix:
- Set TimeEditor max to current mount time.
- Ignored forced future `datetime-local` changes before dispatch.
- Added specific `confirmationFutureTimeError` copy for `logged_at_future`.
- Added focused tests and wrote `outputs/bug-2.md`.

### C2: Required quota artifacts were missing from disk

Status: fixed

Evidence:
- `lib/library/sketch-pipeline.ts` imported `@/lib/ai/image-analysis-quota`, but the file was absent.
- Vitest failed to resolve `tests/unit/lib/ai/image-analysis-quota.test.ts` and `tests/unit/lib/ai/prompts-approx-grams.test.ts`.
- The migration `supabase/migrations/0023_image_analysis_quota_call_type.sql` was also absent despite being listed in the bug 8 output/state.

Fix:
- Restored `lib/ai/image-analysis-quota.ts`.
- Restored `tests/unit/lib/ai/image-analysis-quota.test.ts`.
- Restored `tests/unit/lib/ai/prompts-approx-grams.test.ts`.
- Restored `supabase/migrations/0023_image_analysis_quota_call_type.sql`.

## Improvement

### I1: Library hydration still dropped micronutrient and approximate gram metadata

Status: fixed

Evidence:
- `tests/unit/library/to-log-library-item.test.ts` expected `micros` and `approxGrams`.
- `lib/library/to-log-library-item.ts` only flattened macros and omitted both fields.

Fix:
- Preserved `nutrition.micros` and positive finite `nutrition.approxGrams` in `toLogLibraryItem`.

### I2: `LibraryList.tsx` contained a literal NUL byte

Status: fixed

Evidence:
- `rg` treated `app/(app)/log/_components/AddFoodTab/LibraryList.tsx` as binary.
- Byte inspection found one literal NUL inside `const pageResetKey = ...`.

Fix:
- Replaced the literal byte with the source escape `\u0000`, preserving the runtime delimiter without poisoning text tooling.

## Minor

### M1: Image analysis quota is count-then-call, not reservation based

Status: pending

Evidence:
- `getImageAnalysisQuota()` counts existing non-cached vision/sketch rows before model work.
- Parallel requests near the daily/monthly boundary can pass the pre-check concurrently and overshoot slightly.

Disposition:
- Deferred as a minor follow-up. A robust fix needs DB-side reservation/RPC semantics and is outside the safe R1 fix scope.
