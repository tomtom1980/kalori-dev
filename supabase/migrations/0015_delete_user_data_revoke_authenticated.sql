-- Task 5.3 Codex Round 1 C2 fix — revoke EXECUTE on `public.delete_user_data`
-- from the `authenticated` role.
--
-- Migration 0014 granted EXECUTE to authenticated so the SECURITY DEFINER
-- guard could rely on `auth.uid() = p_user_id` to prevent cross-user
-- attacks. That guard is intact — but it does NOT prevent a malicious or
-- buggy CLIENT from calling `supabase.rpc('delete_user_data', { p_user_id:
-- <self> })` directly. Such a call would wipe the calling user's database
-- rows while bypassing the orchestrated cascade in `lib/account/delete.ts`,
-- which means:
--   - storage thumbnails for that user are NOT deleted (leaks Storage
--     space + creates dangling references in `food-thumbnails/{userId}/`).
--   - `auth.users` row is NOT deleted (auth still authenticates a user
--     whose db rows are gone — broken state).
--   - `BroadcastChannel('kalori-auth')` is NOT fired (other tabs keep
--     stale sessions).
--
-- Only the SERVER-side cascade orchestrator (which holds service-role)
-- should reach this RPC. service_role retains EXECUTE via Postgres'
-- default function permissions; this revoke targets only `authenticated`.
--
-- This migration MUST be applied to dev (and prod) before the cascade is
-- considered safe to ship.
--
-- Defense-in-depth: revoke from PUBLIC and anon as well, in case Supabase's
-- default function permissions framework (which auto-grants EXECUTE to
-- PUBLIC on any new function unless explicitly revoked) re-instated those
-- grants between 0014 and now. The original 0014 migration revoked from
-- `public, anon` at line 63 — but since `create or replace function` was
-- used in 0014, the implicit PUBLIC grant gets re-applied on each
-- replace. This migration is the explicit re-revoke that makes the
-- contract durable.

revoke execute on function public.delete_user_data(uuid) from authenticated;
revoke execute on function public.delete_user_data(uuid) from public;
revoke execute on function public.delete_user_data(uuid) from anon;
