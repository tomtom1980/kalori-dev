-- Task 5.2 Codex C2 fix — re-create `public.delete_user_data` as
-- `security definer` so the cascade can wipe rows in tables that have
-- NO authenticated-user RLS policies (`ai_call_log` + `ai_response_cache`
-- are service-role-only tables).
--
-- Under the previous `security invoker` mode (migration 0013), DELETE
-- statements against `ai_call_log` / `ai_response_cache` evaluate against
-- the caller's RLS context. Those tables have no authenticated-user
-- DELETE policy, so the rows were filtered out and the function returned
-- claiming success while leaving AI rows behind. If the subsequent
-- `auth.users` admin delete then failed (recoverable=false →
-- `auth_users_delete_failed_post_db`), the AI rows remained orphaned
-- indefinitely, breaking the I9 "no DB residue" guarantee.
--
-- `security definer` runs the function with the privileges of the
-- function owner (the `postgres` superuser, who created it via the
-- migration apply path). RLS is bypassed inside the function body. We
-- guard the elevated context with an explicit `auth.uid() = p_user_id`
-- check at the top of the body so a malicious caller can never delete
-- another user's rows.
--
-- The `set search_path = public, pg_temp` clause prevents a
-- search-path-attack vector where a malicious schema shadowing
-- `public.<table>` could redirect the DELETEs.
--
-- FK-safe deletion order matches 0013 verbatim:
--   weekly_reviews → ai_call_log → ai_response_cache → water_log
--   → weight_log → food_entries → food_library_items → profiles
-- (food_entries before food_library_items because food_entries.library_item_id
-- is ON DELETE SET NULL, not CASCADE — see design-doc §6.)

create or replace function public.delete_user_data(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Authorization guard: the caller's auth.uid() MUST match the target
  -- user. Without this guard, `security definer` would let anyone with
  -- the authenticated role delete arbitrary users' data.
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'forbidden: caller % cannot delete data for %', auth.uid(), p_user_id
      using errcode = '42501';
  end if;

  -- Same FK-safe deletion order as 0013, now under definer privilege so
  -- the AI tables (no authenticated-user RLS policies) actually delete.
  delete from public.weekly_reviews     where user_id = p_user_id;
  delete from public.ai_call_log        where user_id = p_user_id;
  delete from public.ai_response_cache  where user_id = p_user_id;
  delete from public.water_log          where user_id = p_user_id;
  delete from public.weight_log         where user_id = p_user_id;
  delete from public.food_entries       where user_id = p_user_id;
  delete from public.food_library_items where user_id = p_user_id;
  delete from public.profiles           where id = p_user_id;
end $$;

-- Lock down: only the `authenticated` role may invoke. `anon` and
-- `public` are explicitly denied. Combined with the `auth.uid()` guard
-- above this means: only an authenticated request may call this RPC,
-- and only for the user that authenticated it.
revoke all on function public.delete_user_data(uuid) from public, anon;
grant execute on function public.delete_user_data(uuid) to authenticated;
