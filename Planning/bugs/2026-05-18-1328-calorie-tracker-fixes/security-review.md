# Security Review: 2026-05-18-1328-calorie-tracker-fixes

## Scope

Reviewed `approval-gate.md`, all `outputs/bug-*.md`, `codex/round-1-categorized.md`, `codex/round-2-categorized.md`, `state.md`, batch-touched server/client files, and directly related tests.

Focus areas: server-side quota enforcement, user scoping, future-time validation bypasses, whole-style integer validation, AI/image endpoints, Supabase/RLS assumptions, and persisted `approxGrams`/micronutrient shape.

## Findings

### Critical

None.

### High

None.

### Medium

#### M1: Portion-only library mutations bypassed whole-style integer validation

Status: fixed.

Files:
- `app/api/library/[id]/update/route.ts`
- `app/api/library/merge/route.ts`
- `tests/integration/library-item-update.test.ts`
- `tests/unit/api/library-merge-micros-bound.test.ts`

Impact: authenticated direct API callers could submit `default_portion: 1.5` without `default_unit` against an existing `cup`/`serving`/whole-style library item. Both update and merge schemas only checked integer-ness when the same payload also included `default_unit`; merge was additionally vulnerable because the RPC coalesces omitted `default_unit` to the winner's current unit.

Fix: both routes now read the current owned, non-deleted row's unit before writing when `default_portion` is supplied without `default_unit`, then reject fractional portions for whole-style units with 400. Missing/foreign/tombstoned rows preserve existing not-found behavior.

#### M2: Vision idempotency replay accepted prior non-vision AI call IDs

Status: fixed.

Files:
- `app/api/ai/vision/route.ts`
- `tests/integration/ai-vision.test.ts`

Impact: a reused `client_id` from another AI call type could enter the vision replay path. If it fell through, the unique `(user_id, client_id)` log constraint could also prevent the eventual vision call from being logged, weakening quota accounting.

Fix: `/api/ai/vision` now rejects prior AI call rows whose `call_type` is not `vision` with `409 client_id_call_type_conflict` before cache replay, quota checks, Gemini, or logging.

### Low

#### L1: Image-analysis quota remains count-then-call

Status: pending from Codex R1/R2.

The shared image-analysis quota is enforced server-side and user-scoped, but it is still count-then-call rather than an atomic DB reservation. Highly parallel requests near the boundary can overshoot slightly. A robust fix needs a DB-side reservation/RPC design and remains outside the safe security-review patch scope.

#### L2: `approxGrams` accepts any positive finite number on library mutation surfaces

Status: pending.

`approxGrams` is positive/finite and display-guarded, and `entries/save` filters it out of library nutrition for gram units. However, direct library create/update/merge payloads can still persist nonsensical but finite values or values attached to gram-unit rows. This is user-scoped data-integrity risk, not cross-user exposure. Recommended follow-up: introduce a shared `approxGrams` bound and unit-aware persistence normalization across library create/update/merge.

### Informational

- User scoping is consistently explicit on batch-touched Supabase mutations and reads reviewed (`eq('user_id', userId)` plus RLS where applicable).
- `ai_call_log` and `ai_response_cache` remain service-role-only; quota checks use the admin client but derive `userId` from authenticated profile fences.
- Future-time server validation in `/api/entries/save` still runs before idempotency replay and rejects timestamps beyond the five-minute server skew allowance.
- Micronutrient persistence rejects negative/non-finite/oversized values on reviewed mutation routes; progress aggregation canonicalizes and drops unknown/invalid micronutrient keys.

## Verification

- `pnpm vitest run --pool threads --maxWorkers 1 tests/integration/ai-vision.test.ts tests/integration/library-item-update.test.ts tests/unit/api/library-merge-micros-bound.test.ts tests/unit/lib/ai/image-analysis-quota.test.ts` -> 4 files / 39 tests passed.
- `pnpm typecheck` -> passed.
- `pnpm exec eslint app/api/ai/vision/route.ts app/api/library/[id]/update/route.ts app/api/library/merge/route.ts tests/integration/ai-vision.test.ts tests/integration/library-item-update.test.ts tests/unit/api/library-merge-micros-bound.test.ts` -> 0 errors, 2 pre-existing warnings in `tests/integration/library-item-update.test.ts`.
- `git diff --check` -> passed; only line-ending warnings from Git.
- Focused NUL scan on touched files -> clean.
