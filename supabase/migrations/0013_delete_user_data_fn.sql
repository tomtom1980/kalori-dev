-- Task 5.2 — I9 cascade single-transaction PL/pgSQL function.
--
-- Called from app/api/account/delete/route.ts AFTER Storage cleanup. The
-- route handler enforces the Storage → DB → auth.users ordering; this
-- function is the DB-row half of the cascade in a single transaction.
--
-- Source: planning/.tmp/task-5.2-ui-synthesis.md §5.1 (verbatim from
-- architecture §6.4). FK-safe order:
--   weekly_reviews → ai_call_log → ai_response_cache → water_log → weight_log
--   → food_entries → food_library_items → profiles
-- (food_entries before food_library_items because food_entries.library_item_id
-- is ON DELETE SET NULL, not CASCADE — see design-doc §6.)
--
-- security invoker: runs as the calling auth.uid(); RLS on each table
-- enforces ownership. The route handler additionally calls supabase.auth
-- .getUser() before invoking this RPC so the function never executes
-- without a verified user context.
--
-- auth.users delete is performed AFTER this function returns by the route
-- handler via getAdminSupabase().auth.admin.deleteUser() — keeping the
-- service-role surface minimal and located in one file (per F-IMPL-1
-- ESLint opt-out scoping).

create or replace function public.delete_user_data(p_user_id uuid)
returns void
language plpgsql
security invoker
as $$
begin
  delete from public.weekly_reviews     where user_id = p_user_id;
  delete from public.ai_call_log        where user_id = p_user_id;
  delete from public.ai_response_cache  where user_id = p_user_id;
  delete from public.water_log          where user_id = p_user_id;
  delete from public.weight_log         where user_id = p_user_id;
  delete from public.food_entries       where user_id = p_user_id;
  delete from public.food_library_items where user_id = p_user_id;
  delete from public.profiles           where id = p_user_id;
end $$;
