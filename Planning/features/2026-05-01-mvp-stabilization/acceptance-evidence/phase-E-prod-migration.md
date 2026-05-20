# Phase E Prod Migration Cutover — AC2 Evidence

**Date**: 2026-05-16
**Operator**: superpowers-exec-tomi E.1.7 sub-agent (Claude Opus 4.7)
**Authorized by**: tomtom1980 (explicit GO at E.1.6 gate)
**Target**: kalori-prod (ref `dryysypycsexvlbabtwq`)
**Baseline commit**: 8002a7b (HEAD at execution: 92e55f4 — 2 unrelated post-baseline commits, migrations + script unchanged since baseline)
**Command**:
```
node scripts/apply-prod-migrations-incremental.mjs --apply --env-file Planning/apikeys.txt --migrations 0018,0019,0020,0021 --verbose
```

## Exit code
0

## Stdout + stderr (verbatim)
```
========================================================
  Incremental prod-migration cutover script
========================================================
Mode:         APPLY (WRITES)
Target ref:   dryysypycsexvlbabtwq
Env file:     .\Planning\apikeys.txt
Verbose:      true

[Layer 1 OK] prod ref matches expected dryysypycsexvlbabtwq.

Local migrations: 21 files (0001..0021).

Detecting applied migrations on dryysypycsexvlbabtwq...
  [SQL tracker] SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;
  Source:  schema_migrations
  Applied: 0001

Using explicit --migrations override: 0018, 0019, 0020, 0021

Pending migrations (4):
  - 0018_water_log_atomic_cap.sql
  - 0019_water_log_negative_ml_adjustments.sql
  - 0020_food_library_dedup_index.sql
  - 0021_library_overhaul.sql

Destructive-DDL pre-flight:
  - 0018_water_log_atomic_cap.sql: clean (no destructive DDL).
  - 0019_water_log_negative_ml_adjustments.sql: clean (no destructive DDL).
  - 0020_food_library_dedup_index.sql: clean (no destructive DDL).
  - 0021_library_overhaul.sql: clean (no destructive DDL).
  All pending migrations are non-destructive.

--- Plan ---

  0018_water_log_atomic_cap.sql
    Verification queries:
      * 0018.fn_exists: function public.log_water_with_cap exists (AC2 refers to it as 'water_log_create_with_cap' — actual name verified against 0018 line 74).
      * 0018.advisory_lock_used: function body references pg_advisory_xact_lock (AC2 says pg_try_advisory_xact_lock — actual call is the blocking variant, verified at 0018 line 115).

  0019_water_log_negative_ml_adjustments.sql
    Verification queries:
      * 0019.check_constraint_allows_negative_ml: water_log_count_check permits unit='ml' rows with count between -5000 and 5000 (per 0019 line 8-12).
      * 0019.fn_under_daily_limit_branch: log_water_with_cap body raises under_daily_limit P0013 (re-defined by 0019; see 0019 line 90-95).

  0020_food_library_dedup_index.sql
    Verification queries:
      * 0020.partial_unique_index_exists: partial unique index food_library_items_user_normalized_name_unique on (user_id, normalized_name) WHERE deleted_at IS NULL AND normalized_name IS NOT NULL.

  0021_library_overhaul.sql
    Verification queries:
      * 0021.created_from_check_widened: food_library_items_created_from_check includes 'manual' (widened by 0021 line 75-80).
      * 0021.sketch_columns_present: 4 sketch tracking columns (thumbnail_kind, sketch_generated_at, sketch_attempt_count, sketch_last_error) added by 0021. AC2's column list (sketch_image_storage_path / sketch_thumb_storage_path / sketch_prompt / sketch_meta) is from an earlier design that did not ship — verify against migration body.
      * 0021.thumbnail_kind_check: thumbnail_kind CHECK constraint accepts 'photo' / 'sketch' (added by 0021 line 102-107).

--- end Plan ---

Applying 4 migration(s):
[1/4] 0018_water_log_atomic_cap.sql ...   [SQL 0018_water_log_atomic_cap.sql] -- supabase/migrations/0018_water_log_atomic_cap.sql — bugfix-tomi -- 2026-05-09-water-custom-button Codex Round 1 fix (Findings C1 + C2). -- -- Purpose -- ------- -- Replace the SUM-then-insert daily...
applied (HTTP 201, 2222ms)
    Verifying 2 predicate(s):
  [SQL 0018.fn_exists] SELECT 1 AS hit FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'log_water_with_cap';
      PASS 0018.fn_exists
  [SQL 0018.advisory_lock_used] SELECT 1 AS hit FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'log_water_with_cap' AND pg_get_functiondef(p.oid) ILIKE '%pg_advisory_xact_lock...
      PASS 0018.advisory_lock_used
[2/4] 0019_water_log_negative_ml_adjustments.sql ...   [SQL 0019_water_log_negative_ml_adjustments.sql] -- Allow dashboard water EDIT to lower today's total by writing negative -- unit='ml' adjustment rows. Glass and bottle rows remain non-negative. alter table public.water_log drop constraint if exists...
applied (HTTP 201, 1727ms)
    Verifying 2 predicate(s):
  [SQL 0019.check_constraint_allows_negative_ml] SELECT pg_get_constraintdef(con.oid) AS def FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid JOIN pg_namespace ns ON ns.oid = rel.relnamespace WHERE ns.nspname = 'public' AND rel.rel...
      PASS 0019.check_constraint_allows_negative_ml
  [SQL 0019.fn_under_daily_limit_branch] SELECT 1 AS hit FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'log_water_with_cap' AND pg_get_functiondef(p.oid) ILIKE '%under_daily_limit%';...
      PASS 0019.fn_under_daily_limit_branch
[3/4] 0020_food_library_dedup_index.sql ...   [SQL 0020_food_library_dedup_index.sql] -- supabase/migrations/0020_food_library_dedup_index.sql — Task D.6 (US-STAB-D6). -- -- F-LIB-DEDUP — partial unique index on `food_library_items -- (user_id, normalized_name) WHERE deleted_at IS NULL...
applied (HTTP 201, 1707ms)
    Verifying 1 predicate(s):
  [SQL 0020.partial_unique_index_exists] SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'food_library_items_user_normalized_name_unique';
      PASS 0020.partial_unique_index_exists
[4/4] 0021_library_overhaul.sql ...   [SQL 0021_library_overhaul.sql] -- supabase/migrations/0021_library_overhaul.sql — bugfix-tomi batch -- 2026-05-16-library-overhaul (Wave 1 — DB migration for Bugs 5 + 6). -- -- Purpose -- ------- -- Combined schema delta supporting...
applied (HTTP 201, 1872ms)
    Verifying 3 predicate(s):
  [SQL 0021.created_from_check_widened] SELECT pg_get_constraintdef(con.oid) AS def FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid JOIN pg_namespace ns ON ns.oid = rel.relnamespace WHERE ns.nspname = 'public' AND rel.rel...
      PASS 0021.created_from_check_widened
  [SQL 0021.sketch_columns_present] SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'food_library_items' AND column_name IN ('thumbnail_kind','sketch_generated_at','sketch_att...
      PASS 0021.sketch_columns_present
  [SQL 0021.thumbnail_kind_check] SELECT pg_get_constraintdef(con.oid) AS def FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid JOIN pg_namespace ns ON ns.oid = rel.relnamespace WHERE ns.nspname = 'public' AND rel.rel...
      PASS 0021.thumbnail_kind_check

All 4/4 migrations applied + verified.

Orphan-profile backfill check:
  [SQL orphan_check] SELECT u.id FROM auth.users u LEFT JOIN public.profiles p ON p.id = u.id WHERE p.id IS NULL;
  No orphan auth users.

R1 firewall check (cascade RPC grants):
  [SQL r1_firewall] SELECT routine_name, grantee, privilege_type FROM information_schema.routine_privileges WHERE routine_name IN ('delete_user_data','set_account_deleting') AND privilege_type='EXECUTE';
  OK — no public/anon/authenticated EXECUTE on cascade RPCs.

Done. Prod schema delta applied + verified.
```

## Per-migration verification results

| Migration | Apply status | Verification queries | Overall |
|---|---|---|---|
| 0018 | applied (HTTP 201, 2222ms) | 2/2 PASS | PASS |
| 0019 | applied (HTTP 201, 1727ms) | 2/2 PASS | PASS |
| 0020 | applied (HTTP 201, 1707ms) | 1/1 PASS | PASS |
| 0021 | applied (HTTP 201, 1872ms) | 3/3 PASS | PASS |

## Orphan-profile backfill

No orphan auth users. Backfill not required.

## R1 firewall check

OK — no public/anon/authenticated EXECUTE grants on cascade RPCs (`delete_user_data`, `set_account_deleting`).

## Overall verdict

GREEN

## Notes

- Schema_migrations tracker source returned `Applied: 0001` only — the production database had 0002..0017 applied via earlier Management API calls that did not populate the tracker table. The script's `--migrations` override correctly targeted only 0018-0021 (the actual pending set as defined by the E.1 task scope).
- All 8 verification predicates across 4 migrations PASS.
- HEAD at execution was `92e55f4` (2 unrelated commits ahead of baseline `8002a7b`). Verified via `git diff 8002a7b..HEAD --name-only` that neither `scripts/apply-prod-migrations-incremental.mjs` nor `supabase/migrations/00{18..21}*.sql` changed since baseline.
- Total apply duration: ~7.5s (well under 5-minute timeout).
