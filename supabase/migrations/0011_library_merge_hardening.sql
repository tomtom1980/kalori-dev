-- supabase/migrations/0011_library_merge_hardening.sql — Task 4.5 R1 Pass 1.
--
-- Renamed from 0010_library_merge_hardening.sql in R2 to resolve a version-
-- prefix collision with 0010_weight_recalc_columns.sql (two migrations
-- cannot share the `0010_` prefix — supabase db push ordering becomes
-- ambiguous within the same version). kalori-dev's
-- supabase_migrations.schema_migrations registry row was updated in-place
-- during R2 (old row deleted, new row inserted with matching statements
-- snapshot). The function body was already applied during R1 — no re-apply
-- required on kalori-dev.
--
-- Purpose: harden `library_merge_atomic` against two Codex Phase 4 Critical
-- findings on top of migration 0009.
--
-- C1 — Tombstone guard.
--   Migration 0009 short-circuits to `replayed=true` when EITHER the winner
--   OR the loser row is missing — but it does NOT distinguish between "row
--   never existed" and "row is tombstoned (deleted_at IS NOT NULL)". Task
--   4.1's tombstone column (migration 0007) lets users soft-delete with a
--   5s undo window; if a merge runs against a tombstoned row, the RPC
--   would either UPDATE a row hidden from the user (winner) or short-
--   circuit to replayed=true (loser) — both are incorrect: neither row
--   should be usable as a merge target while in tombstone state. Fix:
--   filter the winner + loser SELECTs by `deleted_at IS NULL` and raise
--   `merge_target_tombstoned` (errcode P0003) when the row is found but
--   tombstoned.
--
-- C2 — Advisory-lock keying.
--   Migration 0009 uses `pg_advisory_xact_lock(hashtext(p_client_id::text))`.
--   This serializes ONLY retries that share a client_id (same-client
--   idempotency replay). Two DIFFERENT clients trying to merge the SAME
--   (winner, loser) pair concurrently could both grab their own
--   client-id-keyed locks, both pass the row-existence checks, and race
--   the FK repoint + delete — second invocation fails with FK-error or
--   row-already-gone after first succeeds. Fix: switch the lock key to
--   `(user_id, ordered-pair-of-ids)` so concurrent merges on the same
--   pair (regardless of client_id) serialize correctly. The client_id
--   retry-replay logic is preserved by the existing
--   not-found-on-loser → replayed=true branch (the second invocation
--   won't see the loser row after the first commits).
--
-- Method: `CREATE OR REPLACE FUNCTION` keeps the same signature as 0009.
-- The function body is reproduced (SECURITY INVOKER, REVOKE/GRANT posture
-- re-stated) with the two changes applied.

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
  v_lo  uuid;
  v_hi  uuid;
begin
  -- CF-1 (migration 0009): self-merge guard preserved verbatim.
  if p_winner_id = p_loser_id then
    raise exception 'winner_equals_loser' using errcode = 'P0002';
  end if;

  -- Task 4.5 R1 C2: per-pair advisory lock. Concurrent merges from DIFFERENT
  -- clients on the SAME (winner, loser) pair must serialize so only one
  -- transaction performs the FK repoint + delete; the other observes the
  -- loser already gone and short-circuits to replayed=true. Ordering the
  -- pair via least/greatest makes the key direction-independent ((A,B) and
  -- (B,A) hash to the same value).
  v_lo := least(p_winner_id, p_loser_id);
  v_hi := greatest(p_winner_id, p_loser_id);
  perform pg_advisory_xact_lock(
    hashtext(v_user::text || ':' || v_lo::text || ':' || v_hi::text)
  );

  -- Winner must exist + be owned + NOT tombstoned. Task 4.5 R1 C1: tombstone
  -- guard — the soft-delete column from migration 0007 hides rows from the
  -- user during the 5s undo window; a merge against a tombstoned winner is
  -- a logic error. Distinguish "missing" (P0001) from "tombstoned" (P0003)
  -- so the route handler can map them to distinct response surfaces.
  select * into v_winner_row
    from public.food_library_items
   where id = p_winner_id and user_id = v_user and deleted_at is null;
  if not found then
    -- Was the row tombstoned (vs. truly missing)?
    perform 1
      from public.food_library_items
     where id = p_winner_id and user_id = v_user;
    if found then
      raise exception 'merge_target_tombstoned' using errcode = 'P0003';
    end if;
    raise exception 'winner_not_found' using errcode = 'P0001';
  end if;

  -- Loser lookup with the same tombstone guard. Replay path is preserved:
  -- a missing loser (already merged in a prior invocation) returns the
  -- current winner state with replayed=true.
  select * into v_loser_row
    from public.food_library_items
   where id = p_loser_id and user_id = v_user and deleted_at is null;
  if not found then
    -- Distinguish tombstoned-but-present from truly-gone for symmetry with
    -- the winner branch. Truly-gone = legitimate replay path.
    perform 1
      from public.food_library_items
     where id = p_loser_id and user_id = v_user;
    if found then
      raise exception 'merge_target_tombstoned' using errcode = 'P0003';
    end if;
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
  'caller RLS. Task 4.5 R1: advisory lock keyed on (user, ordered-id-pair) so '
  'concurrent merges from DIFFERENT clients on the same (winner, loser) pair '
  'serialize. Tombstone guard (deleted_at IS NULL) on both winner + loser '
  'lookups; raises P0003 ''merge_target_tombstoned'' when a row exists but is '
  'soft-deleted. Returns jsonb {winner, replayed:bool}. P0001 ''winner_not_found'' '
  '→ 409. P0002 ''winner_equals_loser'' → 400 same_ids. P0003 → 409 tombstoned.';
