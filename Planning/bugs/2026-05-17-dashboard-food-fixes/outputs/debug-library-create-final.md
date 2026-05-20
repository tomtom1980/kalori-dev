# Final Blocker Debug: library-create.test

## Scope

Worker A investigated the final-gate blocker:

- `tests/integration/library-create.test.ts`
- failing test: `AC1 round-trip: POST save_to_library:true -> fetchLibraryPage returns the new row`

Nav tests were not touched.

## Reproduction

Initial isolated command:

```bash
pnpm vitest run tests/integration/library-create.test.ts --reporter=verbose
```

Result before fix:

- Failed in isolation.
- Failure: `expected [] to include 'kale-A1-test'`.

Because the file failed by itself, this was not a full-suite order leak.

## Root Cause

The test's fake Supabase client was stale after the entries-save route gained the library creation quota preflight and link/count/bump flow.

Current production route path for `save_to_library:true`:

1. `getLibraryCreateQuota()` calls:
   `.from('food_library_items').select('id', { count: 'exact', head: true }).eq('user_id', ...).gte('created_at', ...).lt('created_at', ...)`
2. Inserts `food_library_items`.
3. Updates the just-created `food_entries.library_item_id`.
4. Counts linked entries with:
   `.from('food_entries').select('id', { count: 'exact', head: true }).eq(...).eq(...)`
5. Bumps `food_library_items.log_count` / `last_used_at`.
6. `fetchLibraryPage()` reads the active library list.

The integration mock only supported the old insert and fetch-list query shape. The quota count chain was missing, so quota lookup threw before the library insert. The route correctly swallowed the library-enrichment failure and still returned `200` for the entry save, leaving the fake library store empty. The subsequent `fetchLibraryPage()` assertion then failed.

This matches the stale mock pattern already fixed in `library-create-cholesterol.test.ts` and entries-save tests.

## Fix

Changed:

- `tests/integration/library-create.test.ts`

Minimal mock updates:

- Added `food_library_items.select('id', { count: 'exact', head: true }).eq().gte().lt()` support for quota checks.
- Added the `food_entries.update(..., { count: 'exact' }).eq().eq()` link-update chain.
- Added the `food_entries.select('id', { count: 'exact', head: true }).eq().eq()` count chain.
- Added `food_library_items.update(...).eq().eq().is()` support for the log-count bump.
- Preserved the existing `fetchLibraryPage()` active-list read behavior.

No production source changed.

## Verification

Passed:

```bash
pnpm vitest run tests/integration/library-create.test.ts --reporter=verbose
```

- 1 file / 1 test passed.

Passed:

```bash
pnpm vitest run tests/integration/library-create.test.ts tests/integration/library-create-cholesterol.test.ts tests/unit/api/entries-save.test.ts tests/unit/api/entries-save-sketch-enqueue.test.ts tests/unit/api/entries-save-micros-bound.test.ts --reporter=verbose
```

- 5 files / 40 tests passed.

Passed:

```bash
pnpm vitest run tests/components/library/LibraryClient.quick-actions.test.tsx tests/integration/library-create-cholesterol.test.ts tests/unit/api/entries-save.test.ts tests/unit/api/entries-save-sketch-enqueue.test.ts tests/unit/api/entries-save-micros-bound.test.ts tests/integration/library-create.test.ts --pool threads --maxWorkers 1 --reporter=verbose
```

- 6 files / 48 tests passed.
- Only warning: existing Radix dialog missing description warning from `LibraryClient.quick-actions.test.tsx`.

Passed:

```bash
pnpm typecheck
```

Passed:

```bash
pnpm exec prettier --check tests/integration/library-create.test.ts
```

## Status

Resolved for Worker A scope. The final-gate library-create blocker was a stale integration mock, not a production behavior regression.
