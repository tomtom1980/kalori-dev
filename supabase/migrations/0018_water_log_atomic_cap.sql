-- supabase/migrations/0018_water_log_atomic_cap.sql — bugfix-tomi
-- 2026-05-09-water-custom-button Codex Round 1 fix (Findings C1 + C2).
--
-- Purpose
-- -------
-- Replace the SUM-then-insert daily-cap enforcement in
-- `app/api/water/log/route.ts` with an atomic PL/pgSQL function so that
-- two concurrent POSTs cannot both pass a stale local cap check and
-- overflow the 5000 ml/day allowance (C2 in Codex Round 1). The same
-- atomic path also closes C1 (fail-open on totals SELECT error): any
-- DB error inside the cap evaluation now happens INSIDE the
-- transaction and surfaces as a structured error to the route, which
-- maps it to HTTP 500 — there is no `?? 0` fallback any more.
--
-- C1 — fail-closed on cap evaluation
--   The route previously read `await computeDayTotalMl(...) ?? 0` and
--   used the coerced 0 as the pre-write total. A transient PostgREST/
--   RLS read failure would silently bypass the cap. The cap evaluation
--   now lives inside this RPC: a SELECT failure raises out of the
--   function and the route's existing `if (rpcError) return 500` path
--   catches it.
--
-- C2 — atomic cap check + insert
--   `pg_advisory_xact_lock(user_id, date)` serializes concurrent
--   POSTs for the same user-day. The lock auto-releases on COMMIT/
--   ROLLBACK so no explicit unlock is needed. Inside the lock we:
--     1. Pre-insert SELECT by (user_id, client_id) for I11 idempotency
--        replay. If a row exists we return it with replayed=true.
--        Cap is intentionally NOT re-evaluated on replay — the row's
--        ml were already counted under the cap state at first-insert
--        time (matches the pre-RPC route semantics verbatim).
--     2. SUM(ml-derived) of all rows for (user_id, p_date) where ml is
--        derived per-unit (glass=250, bottle=500, ml=count) — the
--        Postgres mirror of `mlFromWaterRow` in
--        `lib/dashboard/types.ts`.
--     3. Cap check: if v_current + v_incoming > 5000 ml, raise P0010
--        'over_daily_limit'. The route maps P0010 → HTTP 409 with the
--        contract body { error: 'OVER_DAILY_LIMIT', currentTotalMl,
--        limitMl: 5000 }.
--     4. INSERT the new row. On 23505 unique-violation (concurrent
--        request with same client_id won the race in another
--        transaction), re-SELECT the committed row and return it as a
--        replay — same semantics as the prior route's 23505 handler.
--     5. Re-compute the post-write SUM (now includes the row we just
--        wrote, OR the racing row from the 23505 handler) and return
--        it as `total_ml` so the route can hand it to the client
--        without a second round-trip.
--
-- Return shape
-- ------------
--   jsonb {
--     row:       <full water_log row jsonb>,
--     replayed:  boolean,        -- true on I11 replay or 23505 race
--     total_ml:  integer         -- post-write authoritative total
--   }
--
-- Error codes raised
-- ------------------
--   P0010 'over_daily_limit'  → route maps to 409
--   P0011 'water_log_unauthenticated' → route maps to 500 (defensive;
--          auth.uid() should never be null here because the route's
--          orphan-profile fence runs first, but the RPC is its own
--          security perimeter and must not silently insert with NULL
--          user_id)
--
-- Security posture
-- ----------------
-- SECURITY INVOKER. RLS on water_log is unchanged from migration 0003;
-- every UPDATE/SELECT/INSERT inside this body filters by
-- `user_id = v_user` so RLS's own predicate is redundantly satisfied
-- (defense-in-depth). REVOKE ALL FROM PUBLIC + GRANT EXECUTE TO
-- authenticated mirrors the established posture from migration 0008.

create or replace function public.log_water_with_cap(
  p_client_id uuid,
  p_date      date,
  p_count     integer,
  p_unit      text
) returns jsonb
language plpgsql
security invoker
as $$
declare
  v_user        uuid := auth.uid();
  v_existing    public.water_log;
  v_inserted    public.water_log;
  v_race_row    public.water_log;
  v_current_ml  bigint;
  v_incoming_ml integer;
  v_total_ml    bigint;
  v_max_ml      constant integer := 5000;
begin
  -- Defensive auth check — the route's orphan-profile fence runs first
  -- so this should never fire, but the RPC is a separate security
  -- perimeter; we must not insert with user_id = NULL.
  if v_user is null then
    raise exception 'water_log_unauthenticated' using errcode = 'P0011';
  end if;

  -- Compute ml for the incoming row (Postgres mirror of ML_PER_UNIT).
  v_incoming_ml := case p_unit
    when 'glass'  then p_count * 250
    when 'bottle' then p_count * 500
    when 'ml'     then p_count
    else null
  end;
  if v_incoming_ml is null then
    raise exception 'water_log_invalid_unit' using errcode = 'P0012';
  end if;

  -- Per-(user, date) advisory lock. Concurrent POSTs from the chip +
  -- FAB on the same user-day serialize here so the cap check + INSERT
  -- run atomically. Hash both inputs into a single bigint key for
  -- xact_lock(bigint).
  perform pg_advisory_xact_lock(
    hashtext(v_user::text || ':water:' || p_date::text)
  );

  -- I11 idempotency replay — pre-insert SELECT by (user_id, client_id).
  -- If a row exists we return it WITHOUT re-evaluating the cap (the
  -- replay does not add new ml to the day).
  select * into v_existing
    from public.water_log
   where user_id = v_user and client_id = p_client_id;
  if found then
    select coalesce(sum(case unit
      when 'glass'  then count * 250
      when 'bottle' then count * 500
      when 'ml'     then count
      else 0
    end), 0) into v_total_ml
      from public.water_log
     where user_id = v_user and date = p_date;
    return jsonb_build_object(
      'row',      to_jsonb(v_existing),
      'replayed', true,
      'total_ml', v_total_ml
    );
  end if;

  -- Pre-write SUM under the advisory lock — the cap evaluation is now
  -- atomic with respect to the INSERT below. A SELECT error here
  -- raises out of the RPC and the route returns 500 (C1 fail-closed).
  select coalesce(sum(case unit
    when 'glass'  then count * 250
    when 'bottle' then count * 500
    when 'ml'     then count
    else 0
  end), 0) into v_current_ml
    from public.water_log
   where user_id = v_user and date = p_date;

  if v_current_ml + v_incoming_ml > v_max_ml then
    -- Cap reject — surface the current total so the route can echo it
    -- in the 409 response body (the chip uses it to re-sync).
    raise exception using
      errcode = 'P0010',
      message = 'over_daily_limit',
      detail  = v_current_ml::text;
  end if;

  -- Fresh INSERT inside the lock. On 23505 (concurrent insert with
  -- the same client_id committed in a parallel transaction) we
  -- re-SELECT the racing row and return it as a replay — same
  -- semantics as the prior route handler.
  begin
    insert into public.water_log (user_id, client_id, date, count, unit)
    values (v_user, p_client_id, p_date, p_count, p_unit)
    returning * into v_inserted;
  exception when unique_violation then
    select * into v_race_row
      from public.water_log
     where user_id = v_user and client_id = p_client_id;
    if found then
      select coalesce(sum(case unit
        when 'glass'  then count * 250
        when 'bottle' then count * 500
        when 'ml'     then count
        else 0
      end), 0) into v_total_ml
        from public.water_log
       where user_id = v_user and date = p_date;
      return jsonb_build_object(
        'row',      to_jsonb(v_race_row),
        'replayed', true,
        'total_ml', v_total_ml
      );
    end if;
    -- Race row missing after 23505 — should not happen, but surface
    -- as a generic db_error rather than a silent success.
    raise;
  end;

  -- Post-write SUM (includes the row we just inserted).
  select coalesce(sum(case unit
    when 'glass'  then count * 250
    when 'bottle' then count * 500
    when 'ml'     then count
    else 0
  end), 0) into v_total_ml
    from public.water_log
   where user_id = v_user and date = p_date;

  return jsonb_build_object(
    'row',      to_jsonb(v_inserted),
    'replayed', false,
    'total_ml', v_total_ml
  );
end;
$$;

revoke all on function public.log_water_with_cap(uuid, date, integer, text) from public;
grant execute on function public.log_water_with_cap(uuid, date, integer, text) to authenticated;

comment on function public.log_water_with_cap(uuid, date, integer, text) is
  'Atomic water-log writer with 5000 ml/day cap (bugfix-tomi 2026-05-09-'
  'water-custom-button Codex Round 1 C1+C2). SECURITY INVOKER, runs '
  'under caller RLS. Per-(user, date) advisory lock serializes '
  'concurrent posts so the cap check + INSERT are atomic. Returns '
  'jsonb {row, replayed, total_ml}. P0010 over_daily_limit → 409, '
  'P0011 unauthenticated → 500, P0012 invalid_unit → 400.';
