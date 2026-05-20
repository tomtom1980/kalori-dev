# Bug 1: Library card log_count badge stays at 0 after first save-to-library

## Classification

known_fix

## Root Cause

`app/api/entries/save/route.ts` lines 569-584 — the save-to-library branch INSERTs the new `food_library_items` row WITHOUT explicitly setting `log_count` or `last_used_at`. The DB defaults (`log_count int not null default 0`, `last_used_at` nullable / null) leave the row in a "never logged" state even though the same request has already INSERTed the corresponding `food_entries` row at lines ~260-330 (entry commits BEFORE this enrichment block runs). The re-log path (lines 421-509) AND `/api/library/[id]/log-now` (lines 511-556) both correctly derive `log_count` from `COUNT(food_entries)` AFTER the entry insert; only the first-save path is broken. Net effect: badge reads `0×` until the user re-logs the same item via either the re-log path or `log-now`, which finally bumps it.

## Proposed Change (Diff Outline)

Modify the INSERT payload inside `app/api/entries/save/route.ts` save-to-library branch (lines ~569-584). Add two fields:

```ts
const { data: libRow, error: libError } = (await supabase
  .from('food_library_items')
  .insert({
    user_id: userId,
    client_id: crypto.randomUUID(),
    normalized_name: computedNormalized,
    display_name: firstItem.name,
    nutrition: { kcal: firstItem.kcal, macros, micros },
    created_from: body.source,
    thumbnail_kind: null,
    // Bug 1 fix (2026-05-17) — the food_entries INSERT at the top
    // of this handler already committed; this library row IS the
    // first-log target. Hardcoding log_count: 1 + last_used_at: now
    // matches the post-insert state the re-log COUNT(*) path would
    // derive. Mirrors design-doc §10 frequency-sort contract.
    log_count: 1,
    last_used_at: new Date().toISOString(),
  })
  .select('id, display_name')
  .single()) as { ... };
```

No other code paths change. Cache invalidation (`revalidateTag` + `revalidatePath('/library', 'page')`) is already in place at lines 595-603 and continues to fire on success.

**Why hardcode `1` instead of `COUNT(*)`:** the save-to-library branch is a fresh INSERT — no prior library row exists for this `normalized_name` (the request was specifically `save_to_library === true && !body.library_item_id`). The entry committed at the top of the handler is guaranteed to be the only entry pointing at this library row. `COUNT(*)` would (a) cost a round-trip, (b) require the row to be inserted first so the `library_item_id` FK on entries points at it (which it currently doesn't — the entry is inserted with the user-supplied or null `library_item_id`, not the freshly-minted library row's id), and (c) introduce a concurrency surface the simpler hardcode avoids. The re-log path uses `COUNT(*)` because there's an existing row whose true count may have drifted; here, the row is brand new.

**Concurrent-tab race consideration:** two tabs both submitting `save_to_library: true` for the same food name simultaneously each generate a fresh `client_id = crypto.randomUUID()`. The `food_library_items` table has `UNIQUE(client_id)` but NO unique constraint on `(user_id, normalized_name)` (verified at `supabase/migrations/0003_food_schema.sql:43-58` — only `food_library_user_normalized_idx` exists, not a unique). So both INSERTs succeed and produce two library rows for the same name — both with `log_count: 1`. This matches existing behavior; only one entry was committed per request, so each row truthfully reflects 1 log. The downstream dedup-merge UI handles consolidation. Race is pre-existing and out-of-scope.

## Files Affected

- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\api\entries\save\route.ts` (1 INSERT statement, 2 new fields, ~4 lines)

Tests to add:
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\api\entries-save.test.ts` (extend existing, OR add `tests\unit\api\entries-save-library-log-count.test.ts`)

## TDD Required

yes — DB write logic. RED-first.

## Test Approach

**RED-first unit tests** (mock supabase per existing `tests/unit/api/entries-save.test.ts` pattern):

1. **Save-to-library sets log_count=1.** POST `/api/entries/save` with `save_to_library: true, source: 'text'`. Assert the supabase `.insert()` call on `food_library_items` was invoked with a payload containing `log_count: 1` and `last_used_at` matching ISO-8601. RED-fails today because the payload omits both fields.

2. **Save-to-library sets last_used_at to a recent timestamp.** Same as above but assert `last_used_at` is within 5 seconds of test time. Defends against future regression that hardcodes `null` or omits the field.

3. **Re-log path counter behavior unchanged (regression guard).** POST with `library_item_id: <existing>`. Assert the existing COUNT(*)-after-INSERT pattern still runs and the `.update()` call carries the COUNT(*) result, not `1`. Asserts neither path's invariant got crossed.

4. **Manual-source library-create unaffected.** POST `/api/library/create` directly — confirm `log_count` stays at DB default `0` (not 1) because no entry was created. Defends against accidental cross-pollination of the fix to a route where it doesn't belong.

5. **LibraryCard render unchanged (regression).** Existing `tests/components/library/LibraryCard.test.tsx` continues to pass — the badge renders whatever `log_count` value is provided in props. No prop-shape change.

## Risk Assessment

low

- Single INSERT-statement modification, scoped to one code path.
- No schema change, no migration, no RLS impact.
- Cache invalidation already in place.
- Cross-cutting impact: none (no other surface reads this column today besides the LibraryCard badge + the merge route's `library_merge_atomic` RPC which sums log_counts — sum of `1 + N` for merges still correct).
- No race-window change vs current behavior.

## Regression Sweep Needed

- `tests/unit/api/entries-save.test.ts` (existing save-route unit tests must still pass)
- `tests/unit/api/library-create.test.ts` (manual library-create — `log_count` should remain default 0)
- `tests/integration/library-relog-bumps-counters.test.ts` (re-log path COUNT(*) still works)
- `tests/integration/library-undo-reverses-bump.test.ts` (undo decrements correctly — first-save now starts at 1, undo should bring it to 0)
- `tests/integration/library-merge.test.ts` (merge sums `log_count` — first-save sum semantics unchanged)
- `tests/components/library/LibraryCard.test.tsx` (badge rendering with various log_count values)

**Notable boundary case — undo of the first save:** the existing `library-undo-reverses-bump.test.ts` checks that undoing a re-log decrements the counter via COUNT(*)-after-DELETE. Undoing the FIRST save (i.e. deleting the only entry that points at this library row) should bring `log_count` to 0. Verify the undo path either (a) also uses COUNT(*) (it should — design says "concurrency-tolerant derive from COUNT") or (b) increments/decrements by 1. If (b), the hardcoded `1` on initial INSERT pairs symmetrically with `-1` on undo and lands at 0. Either path is safe; surface in tests.

## UI Touching

false — pure data fix in the API route. The badge already renders `item.log_count` verbatim. Visual baselines unaffected unless current snapshots specifically captured `0×` text on a freshly-saved card. Spot-check: `LibraryCard.test.tsx` exercises the badge with parameterized counts but no snapshot is locked to `0×` specifically.

## Predecessor batch overlap

None. The recent six commits since `61b9216` (log-flow nav fixes, Add Food tab merge) do not touch `app/api/entries/save/route.ts`, `app/(app)/library/_components/LibraryCard.tsx`, or `lib/library/fetch.ts`. Stash overlap risk: clear (already confirmed by priming agent in project-context.md).

## Open Questions

None per standing approval.
