# Codex Review Round 2 Categorized Findings

## Counts

| Severity | Count | Fixed in R2 | Pending |
|---|---:|---:|---:|
| Critical | 0 | 0 | 0 |
| Improvement | 1 | 1 | 0 |
| Minor | 1 | 0 | 1 |

## Critical

None.

## Improvement

### I1: Restored migration made generated types freshness stale

Status: fixed

Evidence:
- R1 restored `supabase/migrations/0023_image_analysis_quota_call_type.sql`.
- `lib/database.types.ts` still declared it was generated through `0022_profiles_birthday.sql`.
- `scripts/schema-drift-check.mjs` reported `marker-mismatch`; the focused generated-types freshness test would fail outside the R1 test set.

Fix:
- Updated `lib/database.types.ts` header to `0023_image_analysis_quota_call_type.sql`.
- Updated the migration-content hash to `5f1198f35cd5b8894253886381a3abcba4f55064a9476db2166e1abc4fc653f7`.
- No generated table shape changes were needed because `ai_call_log.call_type` remains typed as `string`.

## Minor

### M1: Image analysis quota is count-then-call, not reservation based

Status: pending from R1

Evidence:
- `getImageAnalysisQuota()` counts existing non-cached vision/sketch rows before model work.
- Parallel requests near the daily/monthly boundary can pass the pre-check concurrently and overshoot slightly.

Disposition:
- Deferred as a minor follow-up. A robust fix needs DB-side reservation/RPC semantics and remains outside the safe R2 scope.
