-- supabase/migrations/0009_library_merge_self_guard.sql — Codex Fix Round 1 (CF-1).
--
-- Purpose: defensive self-merge guard inside `library_merge_atomic`.
--
-- Problem (Codex adversarial review of Task 4.1): `app/api/library/merge` did
-- NOT reject `winnerId === loserId` before calling the RPC. The RPC from
-- migration 0008 would then:
--   1. Load the same row into both `v_winner_row` and `v_loser_row`.
--   2. UPDATE the winner row with summed log_count (doubled) + the picked
--      fields.
--   3. DELETE the loser — which is the same physical row as the winner.
-- Result: silent data loss. The row is gone and any food_entries
-- referencing it would fail on the FK constraint OR (if FK cascade were
-- ever changed) the history would reference a deleted item.
--
-- Fix: two-layer defense.
--   Layer 1 (app): `app/api/library/merge/route.ts` adds a Zod `.refine`
--                  that rejects winnerId === loserId with 400 `same_ids`.
--   Layer 2 (db):  THIS migration — adds `raise exception 'winner_equals_loser'
--                  using errcode = 'P0002'` at the top of the RPC so direct
--                  `supabase.rpc(...)` callers who bypass the HTTP layer
--                  (server-side code, a mis-written test, etc.) can never
--                  trigger the data-loss path. The route handler maps P0002
--                  → 400 `same_ids` for symmetry with the Zod path.
--
-- Method: `CREATE OR REPLACE FUNCTION` with the SAME signature as
-- migration 0008. Entire body reproduced verbatim (SECURITY INVOKER, the
-- pg_advisory_xact_lock hash, the winner/loser lookup pattern, the winner
-- update, the loser delete) — only the self-guard + comment have been
-- added. The REVOKE / GRANT posture is re-applied in case a future
-- migration ever changes default ACLs (Postgres CREATE OR REPLACE does
-- not change grants, but we re-state them defensively).

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
  -- CF-1: self-merge defensive guard. The route's Zod schema rejects
  -- this ahead of the RPC, but a direct supabase.rpc() caller could
  -- bypass validation. Without this guard, the identical id would cause
  -- v_winner_row = v_loser_row, the winner UPDATE would double the
  -- log_count, then the DELETE would remove the only copy of the row
  -- (silent data loss). P0002 is mapped by the Route Handler → 400
  -- `same_ids` response.
  if p_winner_id = p_loser_id then
    raise exception 'winner_equals_loser' using errcode = 'P0002';
  end if;

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
  'found: raises P0001 ''winner_not_found'' → Route Handler maps to 409. On '
  'self-merge (winnerId=loserId): raises P0002 ''winner_equals_loser'' → 400 '
  'same_ids (CF-1 Codex Fix Round 1 defensive guard).';
