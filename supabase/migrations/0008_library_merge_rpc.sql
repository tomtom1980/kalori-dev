-- supabase/migrations/0008_library_merge_rpc.sql — Task 4.1 sub-step 2.
--
-- Purpose: atomic PL/pgSQL function `library_merge_atomic` that merges two
-- `food_library_items` rows (winner + loser) in a single transaction:
--   1. pg_advisory_xact_lock(client_id) prevents concurrent merges on the
--      same client_id from double-committing (I11 idempotency reinforcement).
--   2. Guard: winner row must exist + be owned by caller.
--   3. If loser already gone → idempotent replay; return current winner.
--   4. FK repoint: UPDATE food_entries SET library_item_id = winner WHERE
--      library_item_id = loser (FK target enumeration — food_entries is
--      currently the SOLE referencing table per 0003 schema grep
--      `references public.food_library_items` = 1 match).
--   5. UPDATE winner with picked field values + summed log_count +
--      max(last_used_at) + user_edited_flag=true.
--   6. DELETE loser (hard delete, NOT tombstone — merge is explicit non-undoable
--      per ui-design §7.3.7 tiebreaker #4).
--   7. Return jsonb { winner, replayed } for the Route Handler to pass through.
--
-- Security posture (SECURITY INVOKER — §10 verbatim):
--   * Runs under caller's RLS. `auth.uid()` resolves to the signed-in user.
--   * All UPDATE/DELETE operations are `WHERE user_id = v_user` so RLS's own
--     `using (auth.uid() = user_id)` predicate is redundantly satisfied —
--     defense-in-depth against an RLS mis-config.
--   * No search_path leak: function body uses fully-qualified `public.`
--     identifiers throughout. Postgres resolves `auth.uid()` via the `auth`
--     schema which is on the default search_path for SECURITY INVOKER funcs.
--   * REVOKE ALL ... FROM PUBLIC + GRANT EXECUTE ... TO authenticated is the
--     standard Supabase posture (SECURITY INVOKER, grant only to authenticated
--     role). Service-role can always call (has its own bypass).
--
-- R1 note: client caller MUST route `/api/library/merge` through
-- `authPost` from `lib/auth/refresh-interceptor.ts`. Server-side idempotency
-- is double-protected by:
--   (a) advisory lock on hashtext(client_id) — concurrent requests serialize
--       so the second sees the loser already deleted and returns replayed=true
--   (b) NOT-FOUND-on-loser branch is the replay shortcut
-- The advisory lock is transaction-scoped (xact_lock) so it auto-releases on
-- COMMIT/ROLLBACK; no explicit unlock.

create or replace function public.library_merge_atomic(
  p_winner_id uuid,
  p_loser_id  uuid,
  p_client_id uuid,
  p_fields    jsonb
) returns jsonb
language plpgsql
security invoker
as $$
declare
  v_user uuid := auth.uid();
  v_winner_row public.food_library_items;
  v_loser_row  public.food_library_items;
begin
  -- Advisory lock on client_id — serializes concurrent merges sharing the
  -- same idempotency key so only one transaction performs the FK repoint
  -- + delete; the other sees the loser gone and returns replayed=true.
  perform pg_advisory_xact_lock(hashtext(p_client_id::text));

  -- Winner must exist + be owned. If not: hard error (409 at the Route
  -- Handler via P0001 → mapped response).
  select * into v_winner_row
    from public.food_library_items
   where id = p_winner_id and user_id = v_user;
  if not found then
    raise exception 'winner_not_found' using errcode = 'P0001';
  end if;

  -- Loser lookup. A missing loser means this merge already ran (replay or
  -- concurrent second invocation won the lock race).
  select * into v_loser_row
    from public.food_library_items
   where id = p_loser_id and user_id = v_user;
  if not found then
    -- Replay / idempotent path. Return the winner row (its field values
    -- are whatever the prior merge committed).
    return jsonb_build_object('winner', to_jsonb(v_winner_row), 'replayed', true);
  end if;

  -- FK repoint — food_entries.library_item_id is currently the SOLE FK into
  -- food_library_items.id (verified via migration grep at implementation
  -- time). If a future migration adds another referencing table, extend
  -- this block with additional UPDATEs BEFORE the loser delete.
  update public.food_entries
     set library_item_id = p_winner_id
   where library_item_id = p_loser_id and user_id = v_user;

  -- Winner update: picked field values override existing, derived aggregates
  -- sum/max from both rows.
  update public.food_library_items
     set display_name     = coalesce(p_fields->>'display_name', display_name),
         thumbnail_url    = case when p_fields ? 'thumbnail_url'
                                 then p_fields->>'thumbnail_url'
                                 else thumbnail_url end,
         default_portion  = coalesce((p_fields->>'default_portion')::numeric, default_portion),
         default_unit     = coalesce(p_fields->>'default_unit', default_unit),
         nutrition        = coalesce(p_fields->'nutrition', nutrition),
         log_count        = v_winner_row.log_count + v_loser_row.log_count,
         last_used_at     = greatest(v_winner_row.last_used_at, v_loser_row.last_used_at),
         user_edited_flag = true
   where id = p_winner_id and user_id = v_user
   returning * into v_winner_row;

  -- Hard-delete loser — no tombstone (merge is explicit non-undoable per
  -- ui-design.md §7.3.7 tiebreaker #4 + design-doc §18.7).
  delete from public.food_library_items
   where id = p_loser_id and user_id = v_user;

  return jsonb_build_object('winner', to_jsonb(v_winner_row), 'replayed', false);
end;
$$;

revoke all on function public.library_merge_atomic(uuid, uuid, uuid, jsonb) from public;
grant execute on function public.library_merge_atomic(uuid, uuid, uuid, jsonb) to authenticated;

comment on function public.library_merge_atomic(uuid, uuid, uuid, jsonb) is
  'Atomic two-item merge for food_library_items. SECURITY INVOKER — runs under '
  'caller RLS. Uses pg_advisory_xact_lock(client_id) for concurrent-merge '
  'serialization (I11). Returns jsonb {winner, replayed:bool}. On winner-not-'
  'found: raises P0001 ''winner_not_found'' → Route Handler maps to 409.';
