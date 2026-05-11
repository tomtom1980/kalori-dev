-- Allow dashboard water EDIT to lower today's total by writing negative
-- unit='ml' adjustment rows. Glass and bottle rows remain non-negative.

alter table public.water_log
  drop constraint if exists water_log_count_check;

alter table public.water_log
  add constraint water_log_count_check
  check (
    (unit = 'ml' and count between -5000 and 5000)
    or (unit in ('glass', 'bottle') and count >= 0)
  );

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
  if v_user is null then
    raise exception 'water_log_unauthenticated' using errcode = 'P0011';
  end if;

  v_incoming_ml := case p_unit
    when 'glass'  then p_count * 250
    when 'bottle' then p_count * 500
    when 'ml'     then p_count
    else null
  end;
  if v_incoming_ml is null then
    raise exception 'water_log_invalid_unit' using errcode = 'P0012';
  end if;
  if (p_unit in ('glass', 'bottle') and p_count <= 0)
     or (p_unit = 'ml' and (p_count = 0 or p_count < -5000 or p_count > 5000)) then
    raise exception 'water_log_invalid_count' using errcode = 'P0012';
  end if;

  perform pg_advisory_xact_lock(
    hashtext(v_user::text || ':water:' || p_date::text)
  );

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

  select coalesce(sum(case unit
    when 'glass'  then count * 250
    when 'bottle' then count * 500
    when 'ml'     then count
    else 0
  end), 0) into v_current_ml
    from public.water_log
   where user_id = v_user and date = p_date;

  if v_current_ml + v_incoming_ml > v_max_ml then
    raise exception using
      errcode = 'P0010',
      message = 'over_daily_limit',
      detail  = v_current_ml::text;
  end if;

  if v_current_ml + v_incoming_ml < 0 then
    raise exception using
      errcode = 'P0013',
      message = 'under_daily_limit',
      detail  = v_current_ml::text;
  end if;

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
    raise;
  end;

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
  'Atomic water-log writer with 0..5000 ml/day bounds. Allows negative '
  'unit=ml adjustment rows for dashboard total edits while preserving '
  'positive glass/bottle writes.';
