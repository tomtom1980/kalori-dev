-- supabase/migrations/0012_food_entries_manual_source.sql — Task 4.7.2.
--
-- Purpose: extend the `food_entries.source` CHECK constraint to accept
-- `'manual'` in addition to the original `('text','photo','library')` set
-- defined in migration 0003 line 92. Closes Codex Phase 4 finding B1
-- (Zod-vs-CHECK enum drift).
--
-- B1 — Zod-vs-CHECK drift.
--   The Zod schema in `app/api/entries/save/route.ts:56` already accepts
--   `source: 'manual'` (added during Phase 4 mutation work). Phase 5 ships
--   the offline outbox replay path: when the network returns, queued
--   mutations replay through `/api/entries/save` carrying
--   `source: 'manual'` for the offline-fallback flow. Today those writes
--   pass Zod but trip the DB CHECK constraint and Postgres raises
--   `23514 check_violation` — a hard 500 on the replay path.
--   Fix: align the DB enum with the application enum.
--
-- Method: DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT — the canonical
-- idempotent pattern for CHECK constraint changes (matches the `IF EXISTS`
-- style used in 0007). Postgres assigned the auto-name
-- `food_entries_source_check` to the inline `check (...)` clause in 0003
-- (verified on kalori-dev via
-- `select conname from pg_constraint where conrelid = 'public.food_entries'::regclass and contype = 'c'`
-- before drafting this migration).
--
-- B5 (sister fix): tombstone filter on `/api/library/dedup-check` route is a
-- TS-only change in `app/api/library/dedup-check/route.ts`. Same git commit
-- as this migration, but no SQL needed — the filter rides on top of the
-- existing `food_library_items.deleted_at` column from migration 0007.

alter table public.food_entries
  drop constraint if exists food_entries_source_check;

alter table public.food_entries
  add constraint food_entries_source_check
    check (source in ('text','photo','library','manual'));
