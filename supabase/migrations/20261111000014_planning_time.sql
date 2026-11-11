-- Actual work is retained; only narrow, authenticated RPCs expose mutations.
create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete restrict,
  shift_id uuid references public.work_shifts(id) on delete restrict,
  started_at timestamptz(3) not null check (isfinite(started_at)),
  ended_at timestamptz(3) check (isfinite(ended_at)),
  hourly_rate_ore integer check (hourly_rate_ore between 0 and 1000000),
  start_key uuid not null,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz(3) not null,
  updated_at timestamptz(3) not null,
  correction_reason text,
  corrected_at timestamptz(3),
  corrected_by uuid references public.profiles(id) on delete restrict,
  check (ended_at is null or ended_at >= started_at),
  check ((correction_reason is null and corrected_at is null and corrected_by is null)
    or (correction_reason is not null and length(btrim(correction_reason)) between 3 and 500
      and corrected_at is not null and isfinite(corrected_at) and corrected_by is not null)),
  constraint time_entries_start_key_unique unique (profile_id, start_key)
);
create unique index time_entries_one_open on public.time_entries(profile_id) where ended_at is null;
alter table public.time_entries add constraint time_entries_no_overlap exclude using gist (
  profile_id extensions.gist_uuid_ops with =,
  tstzrange(started_at, ended_at, '[)') with &&
);
create index time_entries_profile_start on public.time_entries(profile_id, started_at);
create index time_entries_open_start on public.time_entries(started_at) where ended_at is null;
create index time_entries_shift on public.time_entries(shift_id) where shift_id is not null;

create function public.time_entries_guard() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.date_trunc('milliseconds', now());
  v_role public.app_role;
  v_rate integer;
begin
  v_role := public.app_role();
  if auth.uid() is null or v_role is null then
    raise exception using errcode = '42501', message = 'PLANNING_ACTIVE_REQUIRED';
  end if;
  if tg_op = 'INSERT' then
    if new.profile_id is distinct from auth.uid() then
      raise exception using errcode = '42501', message = 'PLANNING_SELF_REQUIRED';
    end if;
    -- Also serialize a future authorized direct insert, without a maintenance bypass.
    perform 1 from public.profiles where id = auth.uid() and active for no key update;
    if not found then
      raise exception using errcode = '42501', message = 'PLANNING_ACTIVE_REQUIRED';
    end if;
    new.started_at := v_now;
    new.ended_at := null;
    select s.id into new.shift_id from public.work_shifts s
      where s.profile_id = auth.uid() and s.cancelled_at is null
        and s.starts_at <= v_now and v_now < s.ends_at
      for share;
    select r.hourly_rate_ore into new.hourly_rate_ore from public.work_rates r
      where r.profile_id = auth.uid();
    new.version := 1;
    new.created_at := v_now;
    new.correction_reason := null;
    new.corrected_at := null;
    new.corrected_by := null;
  else
    if row(new.id, new.profile_id, new.shift_id, new.start_key, new.created_at)
      is distinct from row(old.id, old.profile_id, old.shift_id, old.start_key, old.created_at) then
      raise exception 'PLANNING_IMMUTABLE';
    end if;
    -- A self Stop changes only the end; earlier correction metadata survives.
    if old.profile_id = auth.uid() and old.ended_at is null and new.ended_at = v_now
      and (to_jsonb(new) - array['ended_at', 'updated_at', 'version'])
        is not distinct from (to_jsonb(old) - array['ended_at', 'updated_at', 'version']) then
      new.ended_at := v_now;
    else
      if v_role <> 'owner' then
        raise exception 'PLANNING_IMMUTABLE';
      end if;
      new.correction_reason := btrim(new.correction_reason);
      if new.correction_reason is null or length(new.correction_reason) not between 3 and 500 then
        raise exception 'TIME_REASON';
      end if;
      if new.started_at is null or not isfinite(new.started_at) or new.started_at > v_now
        or (new.ended_at is not null and (not isfinite(new.ended_at)
          or new.ended_at < new.started_at or new.ended_at > v_now)) then
        raise exception 'TIME_INTERVAL';
      end if;
      if new.hourly_rate_ore is distinct from old.hourly_rate_ore then
        select r.hourly_rate_ore into v_rate from public.work_rates r where r.profile_id = old.profile_id;
        if old.hourly_rate_ore is not null or v_rate is null
          or new.hourly_rate_ore is distinct from v_rate then
          raise exception 'TIME_RATE';
        end if;
      end if;
      new.corrected_at := v_now;
      new.corrected_by := auth.uid();
    end if;
    new.version := old.version + 1;
  end if;
  new.updated_at := v_now;
  return new;
end $$;
revoke all on function public.time_entries_guard() from public, anon, authenticated;

create trigger time_entries_guard before insert or update on public.time_entries
  for each row execute function public.time_entries_guard();
create trigger time_entries_no_delete before delete on public.time_entries
  for each row execute function public.planning_no_delete();
create trigger audit_time_entries after insert or update on public.time_entries
  for each row execute function public.audit_row_with_old();
alter table public.time_entries enable row level security;
create policy time_entries_select on public.time_entries for select to authenticated
  using (public.app_role() = 'owner'
    or (public.app_role() in ('picker', 'seller') and profile_id = auth.uid()));
revoke all on public.time_entries from public, anon, authenticated;
revoke delete, truncate on public.time_entries from service_role;
grant select on public.time_entries to authenticated;

create function public.clock_in(p_start_key uuid) returns public.time_entries
language plpgsql security definer set search_path = ''
as $$
declare
  v_entry public.time_entries;
begin
  if auth.uid() is null or public.app_role() is null then
    raise exception using errcode = '42501', message = 'PLANNING_ACTIVE_REQUIRED';
  end if;
  perform 1 from public.profiles where id = auth.uid() and active for no key update;
  if not found then
    raise exception using errcode = '42501', message = 'PLANNING_ACTIVE_REQUIRED';
  end if;
  if p_start_key is null then
    raise exception 'PLANNING_IMMUTABLE';
  end if;
  select * into v_entry from public.time_entries
    where profile_id = auth.uid() and start_key = p_start_key for update;
  if found then
    return v_entry;
  end if;
  if exists (select from public.time_entries where profile_id = auth.uid() and ended_at is null) then
    raise exception 'TIME_ALREADY_OPEN';
  end if;
  insert into public.time_entries(profile_id, start_key) values (auth.uid(), p_start_key)
    returning * into v_entry;
  return v_entry;
exception
  when exclusion_violation then raise exception 'TIME_OVERLAP';
end $$;
revoke all on function public.clock_in(uuid) from public, anon, authenticated;
grant execute on function public.clock_in(uuid) to authenticated;

create function public.clock_out(p_entry_id uuid) returns public.time_entries
language plpgsql security definer set search_path = ''
as $$
declare
  v_entry public.time_entries;
begin
  if auth.uid() is null or public.app_role() is null then
    raise exception using errcode = '42501', message = 'PLANNING_ACTIVE_REQUIRED';
  end if;
  perform 1 from public.profiles where id = auth.uid() and active for no key update;
  if not found then
    raise exception using errcode = '42501', message = 'PLANNING_ACTIVE_REQUIRED';
  end if;
  select * into v_entry from public.time_entries
    where id = p_entry_id and profile_id = auth.uid() for update;
  if not found then
    raise exception 'PLANNING_NOT_FOUND';
  end if;
  if v_entry.ended_at is not null then
    return v_entry;
  end if;
  update public.time_entries set ended_at = pg_catalog.date_trunc('milliseconds', now())
    where id = v_entry.id returning * into v_entry;
  return v_entry;
exception
  when exclusion_violation then raise exception 'TIME_OVERLAP';
end $$;
revoke all on function public.clock_out(uuid) from public, anon, authenticated;
grant execute on function public.clock_out(uuid) to authenticated;

create function public.correct_time_entry(p_id uuid, p_started_at timestamptz,
  p_ended_at timestamptz, p_reason text, p_expected_version bigint,
  p_fill_missing_rate boolean default false) returns public.time_entries
language plpgsql security definer set search_path = ''
as $$
declare
  v_person uuid;
  v_entry public.time_entries;
  v_rate integer;
  v_constraint text;
  v_now timestamptz := pg_catalog.date_trunc('milliseconds', now());
begin
  if auth.uid() is null or public.app_role() is distinct from 'owner' then
    raise exception using errcode = '42501', message = 'PLANNING_OWNER_REQUIRED';
  end if;
  if p_reason is null or length(btrim(p_reason)) not between 3 and 500 then
    raise exception 'TIME_REASON';
  end if;
  select profile_id into v_person from public.time_entries where id = p_id;
  if not found then
    raise exception 'PLANNING_NOT_FOUND';
  end if;
  -- Clock and correction writers always lock profile before entry, including inactive history.
  perform 1 from public.profiles where id = v_person for no key update;
  select * into v_entry from public.time_entries where id = p_id and profile_id = v_person for update;
  if not found then
    raise exception 'PLANNING_NOT_FOUND';
  end if;
  if public.app_role() is distinct from 'owner' then
    raise exception using errcode = '42501', message = 'PLANNING_OWNER_REQUIRED';
  end if;
  if v_entry.version is distinct from p_expected_version then
    raise exception 'PLANNING_STALE';
  end if;
  -- Validate original inputs before assignment to timestamptz(3) rounds them.
  if p_started_at is null or not isfinite(p_started_at) or p_started_at > v_now
    or (p_ended_at is not null and (not isfinite(p_ended_at)
      or p_ended_at < p_started_at or p_ended_at > v_now)) then
    raise exception 'TIME_INTERVAL';
  end if;
  v_rate := v_entry.hourly_rate_ore;
  if p_fill_missing_rate is null then
    raise exception 'TIME_RATE';
  elsif p_fill_missing_rate then
    if v_rate is not null then
      raise exception 'TIME_RATE';
    end if;
    select r.hourly_rate_ore into v_rate from public.work_rates r where r.profile_id = v_person;
    if v_rate is null then
      raise exception 'TIME_RATE';
    end if;
  end if;
  update public.time_entries set started_at = p_started_at, ended_at = p_ended_at,
    hourly_rate_ore = v_rate, correction_reason = btrim(p_reason),
    corrected_at = pg_catalog.date_trunc('milliseconds', now()), corrected_by = auth.uid()
    where id = v_entry.id returning * into v_entry;
  return v_entry;
exception
  when exclusion_violation then raise exception 'TIME_OVERLAP';
  when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'time_entries_one_open' then
      raise exception 'TIME_ALREADY_OPEN';
    end if;
    raise;
end $$;
revoke all on function public.correct_time_entry(uuid,timestamptz,timestamptz,text,bigint,boolean)
  from public, anon, authenticated;
grant execute on function public.correct_time_entry(uuid,timestamptz,timestamptz,text,bigint,boolean)
  to authenticated;

create function public.planning_daily(p_from date, p_to date)
returns table(profile_id uuid, work_date date, source_kind text, source_id uuid,
  duration_ms bigint, hourly_rate_ore integer, amount_ore bigint)
language plpgsql stable security invoker set search_path = ''
as $$
begin
  if auth.uid() is null or public.app_role() is null then
    raise exception using errcode = '42501', message = 'PLANNING_ACTIVE_REQUIRED';
  end if;
  if p_from is null or p_to is null or not isfinite(p_from) or not isfinite(p_to)
    or p_to < p_from or p_to - p_from > 365 then
    raise exception 'PLANNING_PERIOD';
  end if;
  return query
    with days as (
      -- Each midnight is built from its Oslo date, independently of the preceding offset.
      select p_from + n as day,
        (p_from + n)::timestamp at time zone 'Europe/Oslo' as lo,
        (p_from + n + 1)::timestamp at time zone 'Europe/Oslo' as hi
      from pg_catalog.generate_series(0, p_to - p_from) n
    ), intervals as (
      select s.profile_id, 'shift'::text as kind, s.id, s.starts_at as lo, s.ends_at as hi,
        r.hourly_rate_ore as rate
      from public.work_shifts s left join public.work_rates r on r.profile_id = s.profile_id
      where s.cancelled_at is null
        and s.starts_at < (p_to + 1)::timestamp at time zone 'Europe/Oslo'
        and s.ends_at > p_from::timestamp at time zone 'Europe/Oslo'
      union all
      select t.profile_id, 'time'::text, t.id, t.started_at, t.ended_at, t.hourly_rate_ore
      from public.time_entries t where t.ended_at is not null
        and t.started_at < (p_to + 1)::timestamp at time zone 'Europe/Oslo'
        and t.ended_at >= p_from::timestamp at time zone 'Europe/Oslo'
    ), segments as (
      select i.profile_id, d.day, i.kind, i.id, i.rate,
        (extract(epoch from (least(i.hi, d.hi) - greatest(i.lo, d.lo))) * 1000)::bigint as ms
      from intervals i join days d on (i.lo < d.hi and i.hi > d.lo)
        or (i.kind = 'time' and i.lo = i.hi and i.lo >= d.lo and i.lo < d.hi)
    )
    select s.profile_id, s.day, s.kind, s.id, s.ms, s.rate,
      round(s.ms::numeric * s.rate::numeric / 3600000)::bigint
    from segments s;
end $$;
revoke all on function public.planning_daily(date,date) from public, anon, authenticated;
grant execute on function public.planning_daily(date,date) to authenticated;

-- Extend the existing shift guard once linked actual work exists.
create or replace function public.work_shifts_guard() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.date_trunc('milliseconds', now());
  v_start timestamp;
  v_end timestamp;
  v_source public.work_shifts;
  v_target date;
begin
  if auth.uid() is null or public.app_role() is distinct from 'owner' then
    raise exception using errcode = '42501', message = 'PLANNING_OWNER_REQUIRED';
  end if;
  if tg_op = 'UPDATE' then
    if old.cancelled_at is not null then
      raise exception 'SHIFT_CANCELLED';
    end if;
    if row(new.id, new.created_by, new.created_at, new.copied_from_shift_id, new.copied_week)
      is distinct from row(old.id, old.created_by, old.created_at, old.copied_from_shift_id, old.copied_week) then
      raise exception 'PLANNING_IMMUTABLE';
    end if;
    if new.profile_id is distinct from old.profile_id
      and exists (select from public.time_entries where shift_id = old.id) then
      raise exception 'SHIFT_HAS_TIME';
    end if;
    if new.cancelled_at is not null then
      -- Cancellation changes only its intent/metadata, never business fields.
      if (to_jsonb(new) - array['cancelled_at', 'cancelled_by', 'cancel_reason', 'updated_at'])
        is distinct from (to_jsonb(old) - array['cancelled_at', 'cancelled_by', 'cancel_reason', 'updated_at']) then
        raise exception 'PLANNING_IMMUTABLE';
      end if;
      new.cancel_reason := btrim(new.cancel_reason);
      if new.cancel_reason is null or length(new.cancel_reason) not between 3 and 500 then
        raise exception 'SHIFT_CANCEL_REASON';
      end if;
      new.cancelled_at := v_now;
      new.cancelled_by := auth.uid();
      new.updated_at := v_now;
      return new;
    elsif new.cancelled_by is not null or new.cancel_reason is not null then
      raise exception 'SHIFT_CANCEL_REASON';
    end if;
  else
    if new.created_by is distinct from auth.uid() then
      raise exception using errcode = '42501', message = 'PLANNING_CREATOR_REQUIRED';
    end if;
    if new.cancelled_at is not null or new.cancelled_by is not null or new.cancel_reason is not null then
      raise exception 'SHIFT_CANCELLED';
    end if;
    new.created_at := v_now;
  end if;

  -- Historical notes can be corrected, but scheduling requires an active assignee.
  if tg_op = 'INSERT' or row(new.profile_id, new.starts_at, new.ends_at)
    is distinct from row(old.profile_id, old.starts_at, old.ends_at) then
    perform 1 from public.profiles p where p.id = new.profile_id and p.active for share;
    if not found then
      raise exception 'PLANNING_INACTIVE_PERSON';
    end if;
  end if;
  if new.starts_at is null or new.ends_at is null
    or not isfinite(new.starts_at) or not isfinite(new.ends_at)
    or new.ends_at <= new.starts_at or new.ends_at - new.starts_at > interval '26 hours' then
    raise exception 'SHIFT_INTERVAL';
  end if;
  v_start := new.starts_at at time zone 'Europe/Oslo';
  v_end := new.ends_at at time zone 'Europe/Oslo';
  if v_end::date not between v_start::date and v_start::date + 1 then
    raise exception 'SHIFT_INTERVAL';
  end if;
  perform public.planning_oslo_instant(v_start);
  perform public.planning_oslo_instant(v_end);
  new.shift_date := v_start::date;

  if tg_op = 'INSERT' and (new.copied_from_shift_id is not null or new.copied_week is not null) then
    select * into v_source from public.work_shifts where id = new.copied_from_shift_id for share;
    if not found or v_source.cancelled_at is not null then
      raise exception 'PLANNING_IMMUTABLE';
    end if;
    v_target := v_source.shift_date - (extract(isodow from v_source.shift_date)::integer - 1) + 7;
    if new.copied_week is distinct from v_target
      or row(new.profile_id, new.kind, new.note, new.starts_at, new.ends_at)
        is distinct from row(v_source.profile_id, v_source.kind, v_source.note,
          public.planning_oslo_instant((v_source.starts_at at time zone 'Europe/Oslo') + interval '7 days'),
          public.planning_oslo_instant((v_source.ends_at at time zone 'Europe/Oslo') + interval '7 days')) then
      raise exception 'PLANNING_IMMUTABLE';
    end if;
  end if;
  new.updated_at := v_now;
  return new;
end $$;
revoke all on function public.work_shifts_guard() from public, anon, authenticated;
