-- supabase/migrations/0021_library_overhaul.sql — bugfix-tomi batch
-- 2026-05-16-library-overhaul (Wave 1 — DB migration for Bugs 5 + 6).
--
-- Purpose
-- -------
-- Combined schema delta supporting two of the twelve approved fixes in the
-- library-overhaul batch:
--
--   Bug 5 — AI-generated SKETCH thumbnails for library items
--     The vision flow already populates `thumbnail_url` with a user-uploaded
--     photo; the upcoming Gemini-image worker will also fill it with a
--     generated sketch. We need to distinguish the two kinds AND track
--     generation lifecycle so the worker can retry failures + surface
--     telemetry. Adds four columns:
--       - thumbnail_kind        text NULL  CHECK in ('photo','sketch')
--       - sketch_generated_at   timestamptz NULL
--       - sketch_attempt_count  int NOT NULL DEFAULT 0
--       - sketch_last_error     text NULL
--
--   Bug 6 — Manual library item creation
--     `food_library_items.created_from` was originally CHECK in
--     ('text','photo') (migration 0003) — the save flow couples library
--     creation to actual eating. Bug 6 ships a `/api/library/create` route +
--     dialog that pre-populates the library WITHOUT logging a meal, so the
--     CHECK must accept `'manual'`. The DROP-then-ADD pattern is the
--     standard Postgres swap for a named CHECK constraint.
--
-- Idempotency
-- -----------
-- Re-running this migration is safe:
--   - `ADD COLUMN IF NOT EXISTS` no-ops on existing columns.
--   - `DROP CONSTRAINT IF EXISTS` then `ADD CONSTRAINT` is the atomic swap
--     pattern used by other migrations (e.g. tombstone column add in 0007).
--   - Column COMMENTs are idempotent — COMMENT ON COLUMN unconditionally
--     replaces the prior comment text.
--
-- RLS
-- ---
-- `food_library_items` already enables RLS with four per-`user_id` policies
-- (SELECT/INSERT/UPDATE/DELETE, all `auth.uid() = user_id` — see migration
-- 0003 §1). Policies key on the row's `user_id`, not on any column we are
-- adding, so the new columns INHERIT the existing isolation automatically.
-- This migration does NOT touch any policy.
--
-- Indexes
-- -------
-- A partial index on `(user_id) WHERE thumbnail_kind IS NULL` would help the
-- Bug 5 sketch-backfill worker SELECT rows with no sketch yet, but the
-- expected backfill volume is single-user low (per Bug 5 proposal: ~50-150
-- rows). A sequential scan inside a single-user RLS scope is faster than
-- maintaining a partial index. NO new indexes added.
--
-- Migration-number context
-- ------------------------
-- 0020 was claimed by `0020_food_library_dedup_index.sql` (Task D.6). 0021
-- is the next available slot. The deferred follow-ups
-- `F-LIB-DEDUP-DUPLICATE-INSERT` etc. were not yet picked up, so 0021 is
-- free.

BEGIN;

-- =========================================================================
-- Bug 6 — widen created_from CHECK to ('text','photo','manual')
-- =========================================================================
--
-- The original constraint from migration 0003 is named
-- `food_library_items_created_from_check` (Postgres default for a column
-- CHECK without an explicit `CONSTRAINT` keyword). The DROP-then-ADD swap
-- below is the canonical pattern for widening an enumeration CHECK without
-- losing the column's NOT NULL semantics — the column itself is untouched.
--
-- No existing rows can violate the new constraint because the new set is a
-- strict superset of the prior set ('text','photo' ⊂ 'text','photo','manual').

ALTER TABLE public.food_library_items
  DROP CONSTRAINT IF EXISTS food_library_items_created_from_check;

ALTER TABLE public.food_library_items
  ADD CONSTRAINT food_library_items_created_from_check
  CHECK (created_from IN ('text', 'photo', 'manual'));

COMMENT ON COLUMN public.food_library_items.created_from IS
  'How this library row originated. ''text'' = AI-parsed text entry; '
  '''photo'' = AI-parsed photo (vision); ''manual'' = user typed it into '
  'the /api/library/create dialog without logging a meal. CHECK widened by '
  'migration 0021 (bugfix-tomi 2026-05-16-library-overhaul Bug 6).';

-- =========================================================================
-- Bug 5 — sketch tracking columns
-- =========================================================================

-- thumbnail_kind — discriminator between vision-uploaded photos and
-- Gemini-generated sketches. Nullable because existing rows have no
-- discriminator yet (legacy `thumbnail_url` content predates the sketch
-- flow) — the backfill worker will populate it when it processes each row.
ALTER TABLE public.food_library_items
  ADD COLUMN IF NOT EXISTS thumbnail_kind text NULL;

-- DROP/ADD constraint pattern — using `IF NOT EXISTS` on the column means
-- a partial earlier apply might already have the column; we add the CHECK
-- separately so re-applies converge to the right state.
ALTER TABLE public.food_library_items
  DROP CONSTRAINT IF EXISTS food_library_items_thumbnail_kind_check;

ALTER TABLE public.food_library_items
  ADD CONSTRAINT food_library_items_thumbnail_kind_check
  CHECK (thumbnail_kind IS NULL OR thumbnail_kind IN ('photo', 'sketch'));

COMMENT ON COLUMN public.food_library_items.thumbnail_kind IS
  'Discriminator for `thumbnail_url` source. NULL = unknown / pre-Bug-5 '
  'legacy row (sketch backfill candidate); ''photo'' = user-uploaded via '
  'vision flow; ''sketch'' = Gemini-2.5-flash-image generated. Added by '
  'migration 0021 (Bug 5 sketch tracking).';

-- sketch_generated_at — timestamp when the sketch worker successfully
-- wrote `thumbnail_url` for this row. NULL while sketch is pending /
-- failed.
ALTER TABLE public.food_library_items
  ADD COLUMN IF NOT EXISTS sketch_generated_at timestamptz NULL;

COMMENT ON COLUMN public.food_library_items.sketch_generated_at IS
  'When the Gemini sketch worker successfully wrote `thumbnail_url` for '
  'this row. NULL = no sketch yet (either pending generation or failure). '
  'Added by migration 0021 (Bug 5).';

-- sketch_attempt_count — retry counter. The worker increments on every
-- failed Gemini-image attempt; UI surfaces a "Regenerate" affordance once
-- attempts hit a soft cap. NOT NULL DEFAULT 0 so existing rows are valid.
ALTER TABLE public.food_library_items
  ADD COLUMN IF NOT EXISTS sketch_attempt_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.food_library_items.sketch_attempt_count IS
  'Number of Gemini sketch generation attempts for this row (success + '
  'failure). Incremented on every worker call. Added by migration 0021 '
  '(Bug 5). NOT NULL DEFAULT 0.';

-- sketch_last_error — most-recent Gemini / upload failure message, for
-- debugging + a "retry?" UX hint. NULL when no failure recorded.
ALTER TABLE public.food_library_items
  ADD COLUMN IF NOT EXISTS sketch_last_error text NULL;

COMMENT ON COLUMN public.food_library_items.sketch_last_error IS
  'Verbatim error text from the most-recent failed Gemini sketch '
  'generation or storage upload (truncated to first 500 chars by the '
  'worker before persist). NULL = no failure recorded. Added by '
  'migration 0021 (Bug 5).';

COMMIT;
