-- supabase/migrations/0006_backfill_orphaned_profiles.sql — orphan backfill.
-- Some `auth.users` rows predate migration 0002_profiles.sql's
-- `public.handle_new_user()` trigger and therefore have no corresponding
-- `public.profiles` row. `/api/profile/save` (PATCH semantics) fails for those
-- users because the row it tries to update does not exist, blocking onboarding.
--
-- This migration backfills one `public.profiles` row per orphaned auth user
-- using the same default values that `handle_new_user()` inserts for new
-- sign-ups (bio_sex='other', age=30, height_cm=170, current_weight_kg=70,
-- activity_level='moderate'). All other columns fall back to the table's
-- own defaults — notably `onboarding_completed_at = NULL`, so the
-- post-sign-in redirect still sends these users through `/onboarding`.
--
-- Idempotent: the `where not exists` guard means re-running this migration
-- against a fully-backfilled DB inserts zero rows.

insert into public.profiles (id, bio_sex, age, height_cm, current_weight_kg, activity_level)
select u.id, 'other', 30, 170, 70, 'moderate'
  from auth.users u
  where not exists (select 1 from public.profiles p where p.id = u.id);
