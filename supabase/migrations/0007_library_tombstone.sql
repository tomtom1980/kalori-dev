-- supabase/migrations/0007_library_tombstone.sql — Task 4.1 sub-step 1.
--
-- Purpose: enable the 5s-undoable bulk delete + lazy sweep pattern for the
-- `/library` screen (ui-design.md §7.3.8 + reconciled spec §10 + briefing Q4/Q6).
--
-- This migration ONLY lands the tombstone column + partial index + column
-- comment. The atomic merge RPC from reconciled spec §10 §3 is implemented in
-- a separate migration (0008) alongside sub-step 2's server code (keeps each
-- migration self-contained and reversible independently).
--
-- Runtime contract (implemented in `lib/library/fetch.ts` in sub-step 2, not
-- this migration):
--   * Active-list read:      WHERE user_id = auth.uid() AND deleted_at IS NULL
--   * Bulk-delete tombstone: UPDATE ... SET deleted_at = now()
--                              WHERE id = ANY($1) AND user_id = auth.uid()
--   * Undo (within 5s):      UPDATE ... SET deleted_at = NULL
--                              WHERE client_id = ANY($1) AND user_id = auth.uid()
--   * Lazy sweep on page load:
--                            DELETE FROM ... WHERE user_id = auth.uid()
--                              AND deleted_at IS NOT NULL
--                              AND deleted_at < now() - interval '5 seconds'
--
-- RLS: the existing four policies on `food_library_items` (all keyed to
-- `auth.uid() = user_id`) continue to scope SELECT/UPDATE/DELETE to the
-- row's owner. None of them filter on `deleted_at`, so:
--   * The owner can SELECT their own tombstoned rows (the app layer filters
--     them out of the active list and back in for the sweep candidate query).
--   * The owner can UPDATE `deleted_at` in either direction (tombstone + undo).
--   * The owner can DELETE the row (lazy sweep).
-- Verified via `pg_policies` snapshot in Planning/.tmp/task-4.1-output.md.
-- No policy changes are required by this migration.

-- -----------------------------------------------------------------------------
-- 1. Tombstone column
-- -----------------------------------------------------------------------------
-- Idempotent (`if not exists`) so re-running on a partially-applied database
-- is a no-op. Matches the style of 0006_backfill_orphaned_profiles.sql which
-- also guards with `where not exists`.

alter table public.food_library_items
  add column if not exists deleted_at timestamptz null;

comment on column public.food_library_items.deleted_at is
  'Soft-delete tombstone for the 5s bulk-delete undo window (Task 4.1 Q4/Q6). '
  'NULL = active. Non-null = scheduled for hard delete; the lazy sweep on the '
  'next /library page load hard-deletes rows whose `deleted_at < now() - interval 5 seconds`.';

-- -----------------------------------------------------------------------------
-- 2. Partial index on tombstoned rows
-- -----------------------------------------------------------------------------
-- The lazy-sweep DELETE scans
--   WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '5 seconds'
-- This partial index indexes ONLY the tombstoned subset, so the planner can
-- bounded-scan it instead of the full table. The active-list read path
-- (`WHERE deleted_at IS NULL`) gets no benefit from this index — and that is
-- the intent: the active read path is served by the existing
-- `food_library_user_normalized_idx (user_id, normalized_name)` index, while
-- the tombstone sweep gets its own small index that never grows beyond the
-- current tombstoned row set.

create index if not exists idx_food_library_items_deleted_at
  on public.food_library_items (deleted_at)
  where deleted_at is not null;
