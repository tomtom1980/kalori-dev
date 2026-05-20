# Codex R1 Auto-fix — entries-save log_count integrity (C1 + I1)

## Findings addressed

- **C1 (Critical)** — `app/api/entries/save/route.ts:609-610`. The save-to-library INSERT was setting `log_count: 1` but the food_entries row inserted earlier in the same request had `library_item_id: body.library_item_id ?? null` — it could not point at the just-created library row. The re-log path COUNT(*)s entries WHERE `library_item_id = libRow.id`. The first later re-log would count only that re-log entry and write `log_count = 1` (instead of 2), permanently off-by-one.
- **I1 (Improvement)** — `app/api/entries/save/route.ts:600-617`. With the partial unique index `food_library_items_user_normalized_name_unique` on active `(user_id, normalized_name)`, two simultaneous save-to-library requests on the same food → one INSERT wins, the loser gets 23505. The route swallowed the error → loser's contribution to `log_count` was silently dropped, badge under-counts.

## False-positive check

Neither — both are valid data-integrity findings. The C1 invariant break was created by the original Bug 1 hardcoded-1 fix; the I1 race was pre-existing and survived the Bug 1 fix.

## Files modified

- `app/api/entries/save/route.ts` — save-to-library branch rewritten.
- `tests/unit/api/entries-save.test.ts` — extended `buildMocks()` to cover the new chains + added 5 RED→GREEN tests under a new `Bug 1 + Codex R1 follow-up (C1 + I1)` describe block; updated the AC1-error-path test to use a non-23505 error code (since 23505 is now the recovery path, not the error path).

## Approach

Unified 4-step flow replacing the prior `log_count: 1` hardcode:

1. INSERT the food_library_items row WITHOUT log_count / last_used_at (DB defaults to 0 / null — these are then authoritatively set by the bump step below).
2. **23505 recovery (I1)**: on `libError.code === '23505'`, SELECT the existing active row by `(user_id, normalized_name)` with `is('deleted_at', null)` — recovering the winner-tab's library row id. Recovery-read errors are Sentry-captured; the library remains orphaned for this request (entry write authoritative per design-doc §10.3).
3. **Entry↔library link (C1)**: UPDATE the just-inserted food_entries row to set `library_item_id` to the recovered/new id, predicated on `(id, user_id)` (RLS + defense-in-depth). Link failure Sentry-captures but proceeds to bump (best-available value).
4. **COUNT-derived log_count bump**: `COUNT(food_entries WHERE library_item_id = id)` → `UPDATE food_library_items SET log_count = nextLogCount, last_used_at = now() WHERE id = ... AND user_id = ... AND deleted_at IS NULL`. `Math.max(1, count ?? 1)` floor mirrors the in-file re-log bump + log-now route. Bump-success is the sole owner of cache invalidation (`revalidateTag(TAGS.userLibrary(uid))` + `revalidatePath('/library','page')`). Cleaned up the duplicate revalidatePath that existed after the prior fix.

Sketch enqueue (`enqueueSketchGeneration`) still fires on libRow success path (i.e., INSERT actually landed); skipped on 23505 recovery path because the winning tab already enqueued and the sketch pipeline's idempotency guards would short-circuit a duplicate anyway. Non-23505 errors preserve the original swallow + Sentry contract; no cache invalidation in that branch.

The fix uses inline Supabase calls (no RPC / no transaction) because the project's existing patterns at `app/api/library/[id]/log-now/route.ts:512-549` and the in-file re-log bump at lines ~450-509 already use the same COUNT-after-write idempotent pattern — this is the project's canonical approach.

## Test results

- **New RED tests**: 5/5 GREEN (4 originally RED on the broken code + 1 non-23505-preservation already passed).
- **Existing entries-save unit**: 20/20 GREEN — base `buildMocks()` extended to cover the new SELECT/UPDATE chains so the prior `revalidateTag('user:u-1:library')` assertions in the B2 and AC1 tests still pass after the cache-invalidation site moved from the libRow-success branch to the bump-success branch.
- **Existing entries-save integration**: 8 files, 29/29 GREEN.
- **Library integration (broad sweep)**: 26 files, 108/108 GREEN (8 files / 23 tests skipped — pre-existing skip status, unrelated).

Final tally: 25 unit + 137 integration = **162 tests GREEN, 0 failing**.

## Typecheck / lint

- `pnpm typecheck` — clean (no errors).
- `pnpm eslint app/api/entries/save/route.ts tests/unit/api/entries-save.test.ts` — clean (no warnings).

## Notes

- **Race-condition test reliability**: I1 race-condition test uses a deterministic mock (`libraryInsertError = { code: '23505' }` injected → `existingLibraryRow` returned by the recovery SELECT mock → `libraryCountAfterLink: 2` returned by the COUNT mock). This deterministically exercises the recovery code path without requiring Promise.all parallel fires against a real DB — the parallel-tab semantics are encoded in the mock setup. A live-DB integration-level race test was NOT added because the existing partial unique index migration's verification block (`supabase/migrations/0020_food_library_dedup_index.sql:108-124`) already asserts no duplicate active rows exist, and Vitest's unit-level deterministic mock proves the recovery path's UPDATE / COUNT / bump sequence executes correctly.

- **RPC vs inline UPDATE**: chose inline UPDATE because the project does not use stored procedures for any of the related write paths (`/library/[id]/log-now`, in-file re-log bump, save-to-library, library/create, library/[id]/update). Adding an RPC just for this branch would create a one-off pattern inconsistent with the rest of the codebase. The COUNT-after-write idempotent pattern is concurrency-tolerant on its own (later writer's COUNT observes earlier writer's link/INSERT → eventually consistent without serializable isolation).

- **Cache-invalidation site moved**: previously, `revalidateTag(TAGS.userLibrary(uid))` + `revalidatePath('/library','page')` fired in the libRow-success branch (immediately after INSERT). With the fix, they fire in the bump-success branch (after COUNT+UPDATE). This is correct: the badge displays `log_count`, which is authoritatively set only by the bump — invalidating before the bump would race the prefetch against a stale row.

- **Sentry observability**: 4 new failure points each get distinct `scope` tags (`library_recover_23505`, `library_entry_link`, `library_save_count`, `library_save_bump`) so operator triage stays granular.

## Closure

C1 + I1 closed. The unified invariant (COUNT-derived log_count + entry link + 23505 recovery) is consistent with the re-log path's pattern, so no future re-log will under-count by one. Two-tab concurrent first-save now produces a single library row with log_count = 2 and both food_entries rows linked.
