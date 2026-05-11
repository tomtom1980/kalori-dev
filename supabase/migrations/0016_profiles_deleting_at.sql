-- Task 5.3 Codex Round 1 C3 fix — `profiles.deleting_at` mutation fence.
--
-- The account-deletion cascade in `lib/account/delete.ts` runs as
-- Storage → DB → auth.users sequentially. Between Phase 0 (storage
-- cleanup) and Phase 3 (auth.users delete), a sibling tab / outbox
-- replay / in-flight request can:
--   - upload a NEW thumbnail to `food-thumbnails/{userId}/...` (orphaned
--     after auth.users is gone — the bucket cleanup pass already ran).
--   - INSERT a new `food_entries` / `food_library_items` / `weight_log`
--     etc. row (orphaned after `delete_user_data` runs — the row count
--     was zero when Phase 1 fired, but the new INSERT lands AFTER the
--     transaction committed).
--
-- Fence: a `deleting_at TIMESTAMPTZ NULL` column on `profiles`. When the
-- cascade enters Phase 0 it sets `deleting_at = now()` BEFORE storage
-- cleanup. Mutation routes check this column on every write — a non-null
-- value means "this user is being deleted, no new data accepted".
--
-- RLS: users may READ their own `deleting_at` (so the route's fence
-- check works under their JWT). Users CANNOT WRITE `deleting_at` — the
-- existing profiles UPDATE policy at migration 0002 allows updates of
-- ALL columns by the row's owner; we need a column-level guard.
-- Postgres has no per-column UPDATE policy; the cleanest available
-- approach is a BEFORE UPDATE trigger that reverts a user's attempt to
-- change `deleting_at` while letting service-role through (service-role
-- bypasses RLS, but the trigger fires). The trigger uses
-- `current_setting('role')` to detect service-role; users running under
-- `authenticated` cannot change the column.
--
-- Cascade write path: `lib/account/delete.ts` Phase 0 issues an UPDATE
-- via the user-scoped supabase client. The trigger blocks this. Instead,
-- we expose a new `set_account_deleting(p_user_id uuid)` SECURITY
-- DEFINER function — the only authorised path. It checks
-- `auth.uid() = p_user_id` (so a user can only mark themselves) and
-- writes `deleting_at = now()` directly via the elevated context.

alter table public.profiles
  add column if not exists deleting_at timestamptz null;

-- Trigger: prevent user-initiated writes to `deleting_at`. The
-- `set_account_deleting` SECURITY DEFINER function is the only authorised
-- mutator — it sets `pg_temp.bypass_deleting_at_trigger` to bypass.
create or replace function public.profiles_protect_deleting_at()
returns trigger
language plpgsql
as $$
begin
  if (new.deleting_at is distinct from old.deleting_at)
     and coalesce(current_setting('kalori.bypass_deleting_at', true), '0') <> '1' then
    new.deleting_at := old.deleting_at;
  end if;
  return new;
end $$;

drop trigger if exists profiles_protect_deleting_at_trigger on public.profiles;
create trigger profiles_protect_deleting_at_trigger
  before update on public.profiles
  for each row
  execute function public.profiles_protect_deleting_at();

-- Authorised mutator. Run as Phase 0 of the cascade BEFORE storage cleanup.
create or replace function public.set_account_deleting(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'forbidden: caller % cannot mark % as deleting', auth.uid(), p_user_id
      using errcode = '42501';
  end if;
  perform set_config('kalori.bypass_deleting_at', '1', true);
  update public.profiles
     set deleting_at = now()
   where id = p_user_id;
end $$;

-- Allow `authenticated` role (the only role with auth.uid() != null) to call
-- this. The auth.uid() guard inside the function prevents cross-user attack.
revoke all on function public.set_account_deleting(uuid) from public, anon;
grant execute on function public.set_account_deleting(uuid) to authenticated;
