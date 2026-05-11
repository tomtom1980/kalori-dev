-- supabase/migrations/0010_weight_recalc_columns.sql — Task 4.3b.
--
-- Additive idempotent migration ensuring the three weight-recalc observability
-- columns exist on `public.profiles`. The canonical DDL in `0002_profiles.sql`
-- ALREADY declares these columns (explicit pre-emption, per architecture.md
-- §2.2 and the Task 4.3b briefing), so on `kalori-dev` this migration is a
-- no-op. On `kalori-prod` (which has not yet applied 0005-0009 per setup-state)
-- this migration is the authoritative creator.
--
-- `ADD COLUMN IF NOT EXISTS` is the load-bearing guard — the migration MUST be
-- safe to run on any environment where the column may or may not already be
-- present. Drops, type changes, and removals are forbidden per briefing §
-- Constraints + Out-of-scope.
--
-- Columns:
--   recalc_threshold_pct    numeric NOT NULL DEFAULT 2.0
--     percentage weight-change that fires an auto target recalc (Auto mode).
--   last_target_recalc_at   timestamptz
--     latest server-side recalc completion timestamp; drives nudge render gate.
--   last_dashboard_visit_at timestamptz
--     updated when user dismisses the nudge card; compared against
--     last_target_recalc_at to decide visibility.

-- 1. recalc_threshold_pct (with safe NOT NULL + DEFAULT posture).
alter table public.profiles
  add column if not exists recalc_threshold_pct numeric not null default 2.0;

-- 2. last_target_recalc_at — nullable timestamptz.
alter table public.profiles
  add column if not exists last_target_recalc_at timestamptz;

-- 3. last_dashboard_visit_at — nullable timestamptz.
alter table public.profiles
  add column if not exists last_dashboard_visit_at timestamptz;

comment on column public.profiles.recalc_threshold_pct is
  'Task 4.3b — percent weight-change that fires auto target recalc (default 2.0).';
comment on column public.profiles.last_target_recalc_at is
  'Task 4.3b — latest server-side recalc timestamp; gates TargetUpdatedNudge visibility.';
comment on column public.profiles.last_dashboard_visit_at is
  'Task 4.3b — updated on nudge dismiss; compared against last_target_recalc_at.';
