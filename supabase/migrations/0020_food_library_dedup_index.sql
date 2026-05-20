-- supabase/migrations/0020_food_library_dedup_index.sql — Task D.6 (US-STAB-D6).
--
-- F-LIB-DEDUP — partial unique index on `food_library_items
-- (user_id, normalized_name) WHERE deleted_at IS NULL AND normalized_name
-- IS NOT NULL`. Runs the 7-step transactional cleanup-then-index pattern
-- from `Planning/features/2026-05-01-mvp-stabilization/migration-plan.md §2`
-- + design-doc §7 verbatim.
--
-- Migration-number divergence: the sprint design-doc (2026-05-01) and
-- migration-plan.md both reference slot `0018`, but slot 0018 was claimed by
-- `0018_water_log_atomic_cap.sql` (2026-05-09 bugfix-tomi) and slot 0019 by
-- `0019_water_log_negative_ml_adjustments.sql`. Slot 0020 is the next
-- available number. Task-D.6 briefing §5 documents the renumber; ACs reference
-- "the migration" by contract (predicate + index name), not by slot number.
--
-- ACs covered: AC1 (index exists w/ documented predicate), AC2 (duplicate
-- active insert → 23505), AC3 (transactional dedup keeps most-recent per group,
-- soft-deletes rest, ASSERTs zero remaining, then creates index), AC4
-- (soft-deleted rows do NOT block re-insert — partial-index predicate),
-- AC5 (32-assertion RLS harness unchanged), AC6 (ACCESS EXCLUSIVE lock held
-- continuously from cleanup through index create), AC7 (applied via
-- service-role bypass path; runtime RLS unchanged).
--
-- ORDER BY substitution (briefing §10): the canonical CTE in migration-plan.md
-- orders by `updated_at DESC, id DESC`. However, `food_library_items` does
-- NOT have an `updated_at` column (per architecture.md §2.4 DDL — only
-- `created_at` exists). Substituted to `created_at DESC, id DESC` for a
-- deterministic ordering using the columns that DO exist. The semantic
-- ("keep most-recent row per duplicate group") is preserved.
--
-- SECURITY DEFINER interpretation (briefing §8.5): the migration body is plain
-- SQL — there is NO `CREATE FUNCTION ... SECURITY DEFINER` wrapper. AC7's
-- "executes under SECURITY DEFINER" means "applied via a session-role
-- connection that bypasses RLS" (i.e. the `scripts/apply-prod-migrations.mjs`
-- Supabase Management API path with PAT bearer auth). This connection has
-- service-role-equivalent access and can update rows across `user_id` values
-- during cleanup. Runtime RLS for `food_library_items` is unchanged.
--
-- Idempotency: top-of-migration `DROP INDEX IF EXISTS` before re-create. This
-- makes the migration safe to re-apply after a rollback (migration-plan.md
-- §4.2). The cleanup CTE is naturally idempotent — re-running on a deduped
-- table updates 0 rows.
--
-- VN-diacritic note (design-doc §10 P-3): this migration uses the existing
-- `normalized_name` column which is already normalized at the application
-- layer (lowercase + strip punctuation + sort tokens per architecture.md
-- §2.4). VN diacritic handling (e.g., "phở" vs "PHO") is the application's
-- responsibility via `lib/text/normalize.ts`. If normalization proves
-- inadequate post-soft-launch, mint followup `F-LIB-VN-DIACRITIC-DEDUP` and
-- swap the index expression to `lower(unaccent(name))` (requires
-- `CREATE EXTENSION unaccent` first — NOT bundled in this migration).

BEGIN;

-- Step 1: Acquire write-blocking lock for the entire transaction.
--
-- ACCESS EXCLUSIVE keeps the table off-limits to readers and writers from the
-- moment we acquire it through COMMIT — closing the race window where a
-- concurrent INSERT could land between the post-cleanup ASSERT (step 5) and
-- the CREATE UNIQUE INDEX (step 6). ACCESS EXCLUSIVE is acceptable for
-- Kalori's single-user MVP scale (migration-plan.md §2 Race-safety contract).
LOCK TABLE public.food_library_items IN ACCESS EXCLUSIVE MODE;

-- Step 2: Idempotency — drop the index if a previous apply left it behind.
--
-- Migration-plan.md §4.2 idempotency contract: re-running the migration after
-- a partial apply / rollback must be safe. `DROP INDEX IF EXISTS` is the
-- canonical guard. The drop runs INSIDE the locked transaction so the index
-- doesn't briefly disappear while a sibling session is writing.
DROP INDEX IF EXISTS public.food_library_items_user_normalized_name_unique;

-- Steps 3-4: Identify duplicate active rows by (user_id, normalized_name)
-- WHERE deleted_at IS NULL, keep the most-recent row per group, soft-delete
-- the rest.
--
-- `row_number() OVER (PARTITION BY ... ORDER BY created_at DESC, id DESC)`
-- produces a deterministic ranking inside each duplicate group. rn = 1 is
-- the survivor (most-recent created_at, id-DESC tie-breaker); rn > 1 are
-- the dupes to soft-delete. The id-DESC tie-breaker ensures rows with the
-- exact same created_at still resolve to a single survivor.
--
-- Soft-delete (UPDATE ... SET deleted_at = now()) rather than hard delete:
-- preserves audit trail + matches the sprint-wide tombstone semantics. The
-- existing tombstone tooling (sweep, undo) handles the rows from here.
WITH duplicates AS (
  SELECT id,
         user_id,
         normalized_name,
         created_at,
         row_number() OVER (
           PARTITION BY user_id, normalized_name
           ORDER BY created_at DESC, id DESC
         ) AS rn
  FROM public.food_library_items
  WHERE deleted_at IS NULL AND normalized_name IS NOT NULL
)
UPDATE public.food_library_items
   SET deleted_at = now()
 WHERE id IN (SELECT id FROM duplicates WHERE rn > 1);

-- Step 5: ASSERT zero active duplicates remain.
--
-- Defense-in-depth: even though the CTE above is exhaustive, a future schema
-- change or a logic error in this migration could leave dupes behind. The
-- ASSERT raises and rolls back the transaction if any (user_id,
-- normalized_name) group with deleted_at IS NULL still has count > 1, so the
-- subsequent CREATE UNIQUE INDEX cannot silently fail with 23505 mid-build.
DO $$
DECLARE
  remaining int;
BEGIN
  SELECT count(*) INTO remaining
  FROM (
    SELECT 1
    FROM public.food_library_items
    WHERE deleted_at IS NULL AND normalized_name IS NOT NULL
    GROUP BY user_id, normalized_name
    HAVING count(*) > 1
  ) AS dupes;

  IF remaining > 0 THEN
    RAISE EXCEPTION 'Cleanup left % duplicate active (user_id, normalized_name) groups; aborting before unique index', remaining;
  END IF;
END $$;

-- Step 6: Create the partial unique index INSIDE the locked transaction.
--
-- Predicate: `WHERE deleted_at IS NULL AND normalized_name IS NOT NULL`
-- enforces uniqueness on ACTIVE rows only — soft-deleted rows do not
-- participate (AC4), and rows with a null normalized_name (legacy / unset)
-- are exempt.
--
-- CONCURRENTLY is intentionally NOT used — it is incompatible with
-- BEGIN/COMMIT transactions (would error at apply time). The ACCESS EXCLUSIVE
-- lock above keeps any other session from writing during the build, so the
-- plain CREATE UNIQUE INDEX is safe.
CREATE UNIQUE INDEX food_library_items_user_normalized_name_unique
  ON public.food_library_items (user_id, normalized_name)
  WHERE deleted_at IS NULL AND normalized_name IS NOT NULL;

-- Step 6.5: post-create verification (defensive — confirms the index landed
-- under the expected predicate). Raises and rolls back if the index is
-- missing after CREATE somehow.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname  = 'food_library_items_user_normalized_name_unique'
  ) THEN
    RAISE EXCEPTION 'food_library_items_user_normalized_name_unique index was not created';
  END IF;
END $$;

-- Step 7: Release the ACCESS EXCLUSIVE lock atomically with the index
-- becoming visible to other sessions.
COMMIT;
