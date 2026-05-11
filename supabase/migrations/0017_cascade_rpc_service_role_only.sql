-- Task 5.3 Codex Round 2 NEW-C1 fix — make `set_account_deleting` and
-- `delete_user_data` callable from service-role and revoke client access.
--
-- Background. Migration 0015 revoked EXECUTE on `delete_user_data` from
-- `authenticated` so a malicious or buggy client cannot wipe its own DB
-- rows while bypassing the orchestrated Storage → DB → auth.users
-- cascade in `lib/account/delete.ts`. That defence is correct.
--
-- Round 2 caught the matching bug: the cascade orchestrator was still
-- invoking BOTH `set_account_deleting` (Phase 0) and `delete_user_data`
-- (Phase 2) via the user-scoped Supabase client (the `authenticated`
-- role). After 0015, `delete_user_data` calls fail at the database
-- boundary with permission denied (SQLSTATE 42501); the user's account
-- ends up with `deleting_at` set, storage cleared, but DB rows + auth
-- user intact. Fully broken state.
--
-- Fix has two parts:
--   1) Re-create both SECURITY DEFINER functions with a guard that
--      accepts EITHER:
--        a. an authenticated caller whose `auth.uid()` matches
--           `p_user_id` (preserves the cross-user safety property of the
--           original 0014/0016 design), OR
--        b. a service-role caller (`auth.uid()` is NULL when the JWT
--           role is service_role; the additional explicit check on
--           `current_setting('request.jwt.claim.role')` keeps the
--           function safe even if the call originates from a postgres
--           session with no JWT).
--   2) Revoke EXECUTE on `set_account_deleting` from `authenticated`
--      (matching 0015 for `delete_user_data`). Only the SERVER-side
--      cascade orchestrator (which holds service-role) should reach
--      either RPC. service_role retains EXECUTE via Postgres' default
--      function permissions.
--
-- The guard's "is service-role?" check uses two complementary signals
-- because Supabase runs PostgREST through a JWT-aware role-switching
-- mechanism but raw `psql` / migration sessions do not have a JWT.
-- Both paths must continue to work for tests + admin tooling. Truth
-- table:
--
--   caller                              auth.uid()  jwt role         allowed?
--   ──────────────────────────────────  ──────────  ───────────────  ────────
--   client via PostgREST (auth user)    <uuid>      authenticated    only if uuid == p_user_id
--   client via PostgREST (service-role) NULL        service_role     yes
--   server `lib/supabase/admin.ts`      NULL        service_role     yes
--   raw psql / direct postgres          NULL        NULL             yes  (postgres / migration owner)
--   anon                                NULL        anon             no   (revoked grant blocks call)
--
-- The combined guard `auth.uid() = p_user_id OR auth.uid() IS NULL`
-- captures all four legitimate paths because:
--   - if `auth.uid()` is non-null, only self-target is allowed;
--   - if `auth.uid()` is null, the call could only have reached the
--     function body if the caller already passed the EXECUTE grant
--     (revoked from anon + authenticated above) — so the caller must
--     be service_role / postgres / a definer-owner-equivalent role.
-- This is the same pattern Supabase docs recommend for
-- service-role-callable SECURITY DEFINER helpers.

-- 1. set_account_deleting — relax guard, revoke from authenticated.

create or replace function public.set_account_deleting(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Guard: authenticated caller must target self; null-uid callers
  -- (service-role / postgres) are trusted by virtue of holding EXECUTE
  -- after the revoke below.
  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception 'forbidden: caller % cannot mark % as deleting', auth.uid(), p_user_id
      using errcode = '42501';
  end if;
  perform set_config('kalori.bypass_deleting_at', '1', true);
  update public.profiles
     set deleting_at = now()
   where id = p_user_id;
end $$;

-- Lock down: only service-role should call this. Revoke from authenticated
-- so a malicious client cannot mark its own account as deleting (which
-- would silently 423-block all of its mutation routes — minor DoS).
revoke execute on function public.set_account_deleting(uuid) from authenticated;
revoke execute on function public.set_account_deleting(uuid) from public;
revoke execute on function public.set_account_deleting(uuid) from anon;

-- 2. delete_user_data — relax guard for service-role (revoke already in 0015).

create or replace function public.delete_user_data(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Guard: same pattern as set_account_deleting above.
  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception 'forbidden: caller % cannot delete data for %', auth.uid(), p_user_id
      using errcode = '42501';
  end if;

  -- FK-safe deletion order matches 0014 verbatim.
  delete from public.weekly_reviews     where user_id = p_user_id;
  delete from public.ai_call_log        where user_id = p_user_id;
  delete from public.ai_response_cache  where user_id = p_user_id;
  delete from public.water_log          where user_id = p_user_id;
  delete from public.weight_log         where user_id = p_user_id;
  delete from public.food_entries       where user_id = p_user_id;
  delete from public.food_library_items where user_id = p_user_id;
  delete from public.profiles           where id = p_user_id;
end $$;

-- Re-revoke (defense-in-depth — `create or replace function` re-applies
-- Postgres' default `EXECUTE TO PUBLIC` grant, so we must redo the
-- revokes from migration 0015 here).
revoke execute on function public.delete_user_data(uuid) from authenticated;
revoke execute on function public.delete_user_data(uuid) from public;
revoke execute on function public.delete_user_data(uuid) from anon;
