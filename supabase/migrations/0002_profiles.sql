-- supabase/migrations/0002_profiles.sql — Task 2.1b.
-- Creates `public.profiles`, 4 RLS policies, auto-create trigger on auth.users
-- insert. DDL/policies transcribed verbatim from architecture.md §2.2 + §3.1.
--
-- Idempotent-ish: uses `if not exists` guards where safe; `create policy` will
-- fail on re-run, so re-applying requires dropping the table (dev-only).
-- Production applies this migration exactly once; dev re-runs should use
-- `drop table public.profiles cascade; drop function public.handle_new_user();`
-- before re-applying if schema edits are needed before Task 3.1 lands.
--
-- Notes:
--   - `id` IS the `user_id` (1:1 with auth.users). `profiles` is the only
--     user-owned table using this shape; every other table adds a distinct
--     `user_id` column. RLS policies reference `auth.uid() = id` accordingly.
--   - `recalc_threshold_pct`, `last_target_recalc_at`, `last_dashboard_visit_at`
--     are owned by Task 4.3b (weight-recalc pipeline) — ship the columns now
--     so Task 2.2 onboarding doesn't need a follow-up ALTER, but no recalc
--     logic wires here.
--   - Defaults inserted by the trigger are overwritten during onboarding
--     (Task 2.2 wizard Step 1 → Step 8). `onboarding_completed_at` starts NULL
--     which drives the post-sign-in redirect to `/onboarding`.

create table public.profiles (
  id                         uuid primary key references auth.users(id) on delete cascade,
  -- bio
  bio_sex                    text not null check (bio_sex in ('male','female','other')),
  age                        int  not null check (age between 13 and 120),
  height_cm                  numeric(5,1) not null check (height_cm between 100 and 250),
  current_weight_kg          numeric(5,2) not null check (current_weight_kg between 30 and 350),
  goal_weight_kg             numeric(5,2) check (goal_weight_kg between 30 and 350),
  activity_level             text not null check (activity_level in (
                                 'sedentary','light','moderate','active','very_active'
                               )),
  region                     text,                      -- free text ISO-ish region tag
  dietary_prefs              text[] not null default '{}',
  allergens                  text[] not null default '{}',
  unit_pref                  text not null default 'metric' check (unit_pref in ('metric','imperial')),
  goal_pace                  text check (goal_pace in ('slow','moderate','fast')),
  timezone                   text not null default 'UTC',
  -- derived nutrition state
  bmr                        numeric(7,2),
  tdee                       numeric(7,2),
  calorie_target             numeric(7,2),
  target_mode                text not null default 'auto' check (target_mode in ('auto','manual')),
  manual_override_value      numeric(7,2),
  -- recalc observability (Task 4.3b)
  recalc_threshold_pct       numeric not null default 2.0,
  last_target_recalc_at      timestamptz,
  last_dashboard_visit_at    timestamptz,
  -- lifecycle
  onboarding_completed_at    timestamptz,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

-- auto-insert profile row on auth.users insert
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, bio_sex, age, height_cm, current_weight_kg, activity_level)
  values (new.id, 'other', 30, 170, 70, 'moderate');
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;

-- RLS policies (architecture.md §3.1 — verbatim).
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "profiles_delete_own"
  on public.profiles for delete
  using (auth.uid() = id);
