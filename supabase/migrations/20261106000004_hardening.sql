-- Hardening after the Phase 1 review. Safe to paste into the Supabase SQL editor as-is.
-- Remember to record version 20261106000004 in supabase_migrations.schema_migrations when applying by hand.

-- 1. Lot prefix format (the app validates the same pattern).
alter table public.settings
  add constraint settings_lot_prefix_format check (lot_prefix ~ '^[A-Z0-9]{1,5}$');

-- 2. Owners may correct only notes and gross weight of a batch.
revoke update on public.batches from authenticated;
grant update (notes, gross_weight_g) on public.batches to authenticated;

-- The gross weight can never drop below what is already packed or wasted loose.
create function public.batches_guard_update() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_used bigint;
begin
  if new.gross_weight_g is distinct from old.gross_weight_g then
    perform 1 from public.batches where id = new.id for no key update;
    select coalesce((select sum(p.weight_g) from public.packings p where p.batch_id = new.id), 0)
         + coalesce((select sum(w.weight_g) from public.waste_records w where w.batch_id = new.id), 0)
      into v_used;
    if new.gross_weight_g < v_used then
      raise exception 'WEIGHT_BELOW_USED';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.batches_guard_update() from public, anon, authenticated;
create trigger batches_guard_update before update on public.batches
  for each row execute function public.batches_guard_update();

-- 3. Server-set timestamps. Existing guard functions are replaced with identical behaviour plus the timestamp.
create or replace function public.batches_assign_lot() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_prefix text;
  v_n int;
begin
  new.harvest_date := (new.harvested_at at time zone 'Europe/Oslo')::date;
  new.created_at := now();
  select lot_prefix into v_prefix from public.settings where id;
  v_n := public.next_number('lot', extract(year from new.harvest_date)::int);
  new.lot_number := v_prefix || '-' || to_char(new.harvest_date, 'YY') || '-'
    || lpad(v_n::text, greatest(3, length(v_n::text)), '0');
  return new;
end $$;

create or replace function public.packings_guard() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_harvest date;
  v_net int;
  v_shelf int;
begin
  if auth.uid() is not null and coalesce(public.app_role()::text, '') not in ('owner', 'picker') then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;
  new.packed_at := now();
  select harvest_date into v_harvest from public.batches where id = new.batch_id for no key update;
  if not found then
    raise exception 'BATCH_NOT_FOUND';
  end if;
  if not exists (select 1 from public.sorting_checks where batch_id = new.batch_id) then
    raise exception 'SORTING_CHECK_MISSING';
  end if;
  select net_weight_g, shelf_life_days into v_net, v_shelf from public.products where id = new.product_id;
  new.weight_g := new.units * v_net;
  if new.weight_g > public.batch_remaining_g(new.batch_id) then
    raise exception 'NOT_ENOUGH_LEFT';
  end if;
  new.best_before := v_harvest + v_shelf;
  return new;
end $$;

create or replace function public.waste_guard() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is not null and coalesce(public.app_role()::text, '') not in ('owner', 'picker') then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;
  new.created_at := now();
  if new.weight_g is not null then
    perform 1 from public.batches where id = new.batch_id for no key update;
    if new.weight_g > public.batch_remaining_g(new.batch_id) then
      raise exception 'NOT_ENOUGH_LEFT';
    end if;
  end if;
  return new;
end $$;

create function public.sorting_checks_set_time() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.checked_at := now();
  return new;
end $$;
revoke all on function public.sorting_checks_set_time() from public, anon, authenticated;
create trigger sorting_checks_set_time before insert on public.sorting_checks
  for each row execute function public.sorting_checks_set_time();

-- measured_at is a measurement time and may be client-set, but not in the future.
create function public.temperature_logs_guard() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.measured_at > now() + interval '5 minutes' then
    raise exception 'FUTURE_TIME';
  end if;
  return new;
end $$;
revoke all on function public.temperature_logs_guard() from public, anon, authenticated;
create trigger temperature_logs_guard before insert on public.temperature_logs
  for each row execute function public.temperature_logs_guard();
