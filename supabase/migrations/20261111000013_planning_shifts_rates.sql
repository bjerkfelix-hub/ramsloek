-- Planning starts with private rates and retained, owner-managed shifts.
create extension if not exists btree_gist with schema extensions;

create function public.planning_no_delete() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  raise exception 'PLANNING_NO_DELETE';
end $$;
revoke all on function public.planning_no_delete() from public, anon, authenticated;

-- Reject normalized spring gaps and both occurrences of an autumn wall time.
create function public.planning_oslo_instant(p_local timestamp without time zone)
returns timestamptz
language plpgsql immutable security invoker set search_path = ''
as $$
declare
  v_instant timestamptz;
begin
  if p_local is null or not pg_catalog.isfinite(p_local) then
    raise exception 'PLANNING_LOCAL_TIME';
  end if;
  v_instant := p_local at time zone 'Europe/Oslo';
  if v_instant at time zone 'Europe/Oslo' <> p_local
    or (v_instant - interval '1 hour') at time zone 'Europe/Oslo' = p_local
    or (v_instant + interval '1 hour') at time zone 'Europe/Oslo' = p_local then
    raise exception 'PLANNING_LOCAL_TIME';
  end if;
  return v_instant;
end $$;
revoke all on function public.planning_oslo_instant(timestamp without time zone)
  from public, anon, authenticated;

create table public.work_rates (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete restrict,
  hourly_rate_ore integer not null check (hourly_rate_ore between 0 and 1000000),
  updated_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz(3) not null,
  updated_at timestamptz(3) not null,
  constraint work_rates_profile_unique unique (profile_id)
);

create table public.work_shifts (
  id uuid primary key,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  shift_date date not null check (isfinite(shift_date)),
  starts_at timestamptz(3) not null check (isfinite(starts_at)),
  ends_at timestamptz(3) not null check (isfinite(ends_at)),
  kind text not null check (kind in ('harvest', 'packing', 'market', 'other')),
  note text check (length(note) <= 2000),
  created_by uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  created_at timestamptz(3) not null,
  updated_at timestamptz(3) not null,
  cancelled_at timestamptz(3),
  cancelled_by uuid references public.profiles(id) on delete restrict,
  cancel_reason text,
  copied_from_shift_id uuid references public.work_shifts(id) on delete restrict,
  copied_week date,
  check (ends_at > starts_at and ends_at - starts_at <= interval '26 hours'),
  check ((ends_at at time zone 'Europe/Oslo')::date between shift_date and shift_date + 1),
  check ((cancelled_at is null and cancelled_by is null and cancel_reason is null)
    or (cancelled_at is not null and isfinite(cancelled_at) and cancelled_by is not null
      and cancel_reason is not null and length(btrim(cancel_reason)) between 3 and 500)),
  check ((copied_from_shift_id is null and copied_week is null)
    or (copied_from_shift_id is not null and copied_week is not null and isfinite(copied_week)
      and extract(isodow from copied_week) = 1)),
  constraint work_shifts_no_overlap exclude using gist (
    profile_id extensions.gist_uuid_ops with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (cancelled_at is null)
);
create index work_shifts_profile_start on public.work_shifts(profile_id, starts_at);
create unique index work_shifts_copy_unique
  on public.work_shifts(copied_from_shift_id, copied_week) where copied_from_shift_id is not null;

create function public.work_rates_guard() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.date_trunc('milliseconds', now());
begin
  if auth.uid() is null or public.app_role() is distinct from 'owner' then
    raise exception using errcode = '42501', message = 'PLANNING_OWNER_REQUIRED';
  end if;
  if tg_op = 'UPDATE' then
    if row(new.id, new.profile_id, new.created_at)
      is distinct from row(old.id, old.profile_id, old.created_at) then
      raise exception 'PLANNING_IMMUTABLE';
    end if;
  else
    new.created_at := v_now;
  end if;
  if new.hourly_rate_ore is null or new.hourly_rate_ore not between 0 and 1000000 then
    raise exception 'RATE_INVALID';
  end if;
  new.updated_by := auth.uid();
  new.updated_at := v_now;
  return new;
end $$;
revoke all on function public.work_rates_guard() from public, anon, authenticated;

create function public.work_shifts_guard() returns trigger
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

create trigger work_rates_guard before insert or update on public.work_rates
  for each row execute function public.work_rates_guard();
create trigger work_shifts_guard before insert or update on public.work_shifts
  for each row execute function public.work_shifts_guard();
create trigger work_rates_no_delete before delete on public.work_rates
  for each row execute function public.planning_no_delete();
create trigger work_shifts_no_delete before delete on public.work_shifts
  for each row execute function public.planning_no_delete();
create trigger audit_work_rates after insert or update on public.work_rates
  for each row execute function public.audit_row_with_old();
create trigger audit_work_shifts after insert or update on public.work_shifts
  for each row execute function public.audit_row_with_old();

alter table public.work_rates enable row level security;
alter table public.work_shifts enable row level security;
create policy work_rates_select on public.work_rates for select to authenticated
  using (public.app_role() = 'owner' or (public.app_role() in ('picker', 'seller') and profile_id = auth.uid()));
create policy work_rates_insert on public.work_rates for insert to authenticated
  with check (public.app_role() = 'owner');
create policy work_rates_update on public.work_rates for update to authenticated
  using (public.app_role() = 'owner') with check (public.app_role() = 'owner');
create policy work_shifts_select on public.work_shifts for select to authenticated
  using (public.app_role() = 'owner' or (public.app_role() in ('picker', 'seller') and profile_id = auth.uid()));
create policy work_shifts_insert on public.work_shifts for insert to authenticated
  with check (public.app_role() = 'owner');
create policy work_shifts_update on public.work_shifts for update to authenticated
  using (public.app_role() = 'owner') with check (public.app_role() = 'owner');
revoke all on public.work_rates, public.work_shifts from public, anon, authenticated;
revoke delete, truncate on public.work_rates, public.work_shifts from service_role;
grant select, insert, update on public.work_rates, public.work_shifts to authenticated;

create function public.cancel_work_shift(p_id uuid, p_reason text) returns void
language plpgsql security invoker set search_path = ''
as $$
begin
  if auth.uid() is null or public.app_role() is distinct from 'owner' then
    raise exception using errcode = '42501', message = 'PLANNING_OWNER_REQUIRED';
  end if;
  update public.work_shifts set cancelled_at = pg_catalog.date_trunc('milliseconds', now()),
    cancel_reason = p_reason where id = p_id;
  if not found then
    raise exception 'PLANNING_NOT_FOUND';
  end if;
end $$;
revoke all on function public.cancel_work_shift(uuid, text) from public, anon, authenticated;
grant execute on function public.cancel_work_shift(uuid, text) to authenticated;

create function public.copy_work_week(p_monday date) returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_sources public.work_shifts[];
  v_source public.work_shifts;
  v_target date;
  v_count integer := 0;
begin
  if auth.uid() is null or public.app_role() is distinct from 'owner' then
    raise exception using errcode = '42501', message = 'PLANNING_OWNER_REQUIRED';
  end if;
  if p_monday is null or not isfinite(p_monday) or extract(isodow from p_monday) <> 1 then
    raise exception 'PLANNING_WEEK';
  end if;
  v_target := p_monday + 7;
  -- One copy transaction per source calendar week. Capture and lock sources before inserts.
  perform pg_catalog.pg_advisory_xact_lock(13013, p_monday - date '2000-01-03');
  select array_agg(s::public.work_shifts order by s.id) into v_sources from (
    select * from public.work_shifts
    where shift_date >= p_monday and shift_date < v_target and cancelled_at is null
    order by id for update
  ) s;
  foreach v_source in array coalesce(v_sources, array[]::public.work_shifts[]) loop
    if exists (select 1 from public.work_shifts
      where copied_from_shift_id = v_source.id and copied_week = v_target) then
      continue;
    end if;
    insert into public.work_shifts(id, profile_id, starts_at, ends_at, kind, note,
      copied_from_shift_id, copied_week)
    values (gen_random_uuid(), v_source.profile_id,
      public.planning_oslo_instant((v_source.starts_at at time zone 'Europe/Oslo') + interval '7 days'),
      public.planning_oslo_instant((v_source.ends_at at time zone 'Europe/Oslo') + interval '7 days'),
      v_source.kind, v_source.note, v_source.id, v_target);
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
revoke all on function public.copy_work_week(date) from public, anon, authenticated;
grant execute on function public.copy_work_week(date) to authenticated;
