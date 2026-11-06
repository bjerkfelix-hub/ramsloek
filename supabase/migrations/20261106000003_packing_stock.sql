-- Packing, stock and waste: products, packings, stock movements, waste records.

create type public.unit_kind as enum ('consumer', 'trade');
create type public.movement_kind as enum ('pack', 'sell', 'deliver', 'waste', 'adjust');

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  net_weight_g int not null check (net_weight_g > 0),
  unit_kind public.unit_kind not null,
  gtin char(14) unique check (gtin ~ '^[0-9]{14}$'), -- check digit validated in the app
  shelf_life_days int not null check (shelf_life_days between 1 and 60),
  storage_text text not null default 'Oppbevares kjølig',
  active boolean not null default true
);

create table public.packings (
  id uuid primary key, -- supplied by the client so a repeated submit is idempotent
  batch_id uuid not null references public.batches (id),
  product_id uuid not null references public.products (id),
  units int not null check (units > 0),
  weight_g int not null,
  best_before date not null,
  packed_by uuid not null default auth.uid(),
  packed_at timestamptz default now()
);
create index packings_batch_idx on public.packings (batch_id);
create index packings_product_batch_idx on public.packings (product_id, batch_id);

create table public.waste_records (
  id uuid primary key, -- supplied by the client
  batch_id uuid not null references public.batches (id),
  product_id uuid references public.products (id),
  units int check (units > 0),
  weight_g int check (weight_g > 0),
  reason text not null check (reason in ('visnet', 'skadet', 'utgått', 'annet')),
  note text,
  created_by uuid default auth.uid(),
  created_at timestamptz default now(),
  check ((product_id is not null and units is not null and weight_g is null)
      or (product_id is null and units is null and weight_g is not null))
);
create index waste_records_batch_idx on public.waste_records (batch_id);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id),
  batch_id uuid not null references public.batches (id),
  kind public.movement_kind not null,
  units int not null check (units <> 0),
  packing_id uuid references public.packings (id),
  waste_id uuid references public.waste_records (id),
  created_by uuid default auth.uid(),
  created_at timestamptz default now()
);
create index stock_movements_product_batch_idx on public.stock_movements (product_id, batch_id);

-- Grams of the batch not yet packed or wasted loose.
create function public.batch_remaining_g(p_batch uuid) returns int
language sql stable security invoker set search_path = ''
as $$
  select b.gross_weight_g
    - coalesce((select sum(p.weight_g) from public.packings p where p.batch_id = b.id), 0)
    - coalesce((select sum(w.weight_g) from public.waste_records w where w.batch_id = b.id), 0)
  from public.batches b where b.id = p_batch
$$;
revoke all on function public.batch_remaining_g(uuid) from public, anon;
grant execute on function public.batch_remaining_g(uuid) to authenticated;

-- Packing guard: serialise per batch, require sorting check, derive weight and best-before.
create function public.packings_guard() returns trigger
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
revoke all on function public.packings_guard() from public, anon, authenticated;
create trigger packings_guard before insert on public.packings
  for each row execute function public.packings_guard();

create function public.packings_to_stock() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.stock_movements (product_id, batch_id, kind, units, packing_id, created_by)
  values (new.product_id, new.batch_id, 'pack', new.units, new.id, new.packed_by);
  return null;
end $$;
revoke all on function public.packings_to_stock() from public, anon, authenticated;
create trigger packings_to_stock after insert on public.packings
  for each row execute function public.packings_to_stock();

-- Waste of loose kilos must come out of what is left of the batch.
create function public.waste_guard() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is not null and coalesce(public.app_role()::text, '') not in ('owner', 'picker') then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;
  if new.weight_g is not null then
    perform 1 from public.batches where id = new.batch_id for no key update;
    if new.weight_g > public.batch_remaining_g(new.batch_id) then
      raise exception 'NOT_ENOUGH_LEFT';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.waste_guard() from public, anon, authenticated;
create trigger waste_guard before insert on public.waste_records
  for each row execute function public.waste_guard();

create function public.waste_to_stock() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.units is not null then
    insert into public.stock_movements (product_id, batch_id, kind, units, waste_id, created_by)
    values (new.product_id, new.batch_id, 'waste', -new.units, new.id, new.created_by);
  end if;
  return null;
end $$;
revoke all on function public.waste_to_stock() from public, anon, authenticated;
create trigger waste_to_stock after insert on public.waste_records
  for each row execute function public.waste_to_stock();

-- Stock may never go negative for a product+batch.
create function public.stock_movements_guard() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_balance bigint;
begin
  perform pg_advisory_xact_lock(hashtext(new.product_id::text || new.batch_id::text));
  select coalesce(sum(units), 0) into v_balance
  from public.stock_movements
  where product_id = new.product_id and batch_id = new.batch_id;
  if v_balance + new.units < 0 then
    raise exception 'STOCK_NEGATIVE';
  end if;
  return new;
end $$;
revoke all on function public.stock_movements_guard() from public, anon, authenticated;
create trigger stock_movements_guard before insert on public.stock_movements
  for each row execute function public.stock_movements_guard();

create view public.stock_levels with (security_invoker = true) as
select
  m.product_id,
  pr.name as product_name,
  m.batch_id,
  b.lot_number,
  bb.best_before,
  m.units,
  (bb.best_before - (now() at time zone 'Europe/Oslo')::date)
    <= (select s.best_before_warning_days from public.settings s) as near_expiry
from (
  select product_id, batch_id, sum(units)::int as units
  from public.stock_movements
  group by product_id, batch_id
  having sum(units) > 0
) m
join public.products pr on pr.id = m.product_id
join public.batches b on b.id = m.batch_id
left join lateral (
  select min(p.best_before) as best_before
  from public.packings p
  where p.product_id = m.product_id and p.batch_id = m.batch_id
) bb on true;

create trigger audit_products
  after insert or update or delete on public.products
  for each row execute function public.audit_row();
create trigger audit_packings
  after insert or update or delete on public.packings
  for each row execute function public.audit_row();
create trigger audit_stock_movements
  after insert or update or delete on public.stock_movements
  for each row execute function public.audit_row();
create trigger audit_waste_records
  after insert or update or delete on public.waste_records
  for each row execute function public.audit_row();

alter table public.products enable row level security;
alter table public.packings enable row level security;
alter table public.waste_records enable row level security;
alter table public.stock_movements enable row level security;

create policy products_select on public.products
  for select to authenticated using (public.app_role() is not null);
create policy products_insert on public.products
  for insert to authenticated with check (public.app_role() = 'owner');
create policy products_update on public.products
  for update to authenticated
  using (public.app_role() = 'owner') with check (public.app_role() = 'owner');

create policy packings_select on public.packings
  for select to authenticated using (public.app_role() is not null);
create policy packings_insert on public.packings
  for insert to authenticated
  with check (public.app_role() in ('owner', 'picker') and packed_by = (select auth.uid()));

create policy waste_records_select on public.waste_records
  for select to authenticated using (public.app_role() is not null);
create policy waste_records_insert on public.waste_records
  for insert to authenticated
  with check (public.app_role() in ('owner', 'picker') and created_by = (select auth.uid()));

create policy stock_movements_select on public.stock_movements
  for select to authenticated using (public.app_role() is not null);

revoke all on public.products, public.packings, public.waste_records,
  public.stock_movements, public.stock_levels from anon, authenticated;
grant select, insert, update on public.products to authenticated;
grant select, insert on public.packings to authenticated;
grant select, insert on public.waste_records to authenticated;
grant select on public.stock_movements to authenticated;
grant select on public.stock_levels to authenticated;
