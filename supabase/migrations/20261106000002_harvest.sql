-- Harvest: areas, batches (with lot numbers), sorting checks, temperature log.

-- audit_row: optional trigger argument names the key column (default 'id').
create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_row jsonb := to_jsonb(case when tg_op = 'DELETE' then old else new end);
  v_key text := coalesce(tg_argv[0], 'id');
begin
  insert into public.audit_log (actor, table_name, row_id, action, data)
  values (auth.uid(), tg_table_name, v_row ->> v_key, tg_op, v_row);
  return null;
end $$;

-- Only the security-definer lot trigger may allocate numbers.
revoke execute on function public.next_number(text, int) from public, anon, authenticated;

create table public.harvest_areas (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  lat double precision,
  lng double precision,
  active boolean not null default true
);

create table public.batches (
  id uuid primary key, -- supplied by the client so a repeated submit is idempotent
  lot_number text unique not null,
  harvested_at timestamptz not null,
  harvest_date date not null,
  area_id uuid not null references public.harvest_areas (id),
  pickers text not null,
  gross_weight_g int not null check (gross_weight_g > 0),
  notes text,
  created_by uuid not null default auth.uid(),
  created_at timestamptz default now()
);

create function public.batches_assign_lot() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_prefix text;
  v_n int;
begin
  new.harvest_date := (new.harvested_at at time zone 'Europe/Oslo')::date;
  select lot_prefix into v_prefix from public.settings where id;
  v_n := public.next_number('lot', extract(year from new.harvest_date)::int);
  new.lot_number := v_prefix || '-' || to_char(new.harvest_date, 'YY') || '-'
    || lpad(v_n::text, greatest(3, length(v_n::text)), '0');
  return new;
end $$;
revoke all on function public.batches_assign_lot() from public, anon, authenticated;

create trigger batches_assign_lot
  before insert on public.batches
  for each row execute function public.batches_assign_lot();

create table public.sorting_checks (
  batch_id uuid primary key references public.batches (id),
  statement text not null default 'Sortert og kontrollert for liljekonvall og andre arter',
  checked_by uuid not null default auth.uid(),
  checked_at timestamptz not null default now()
);

create table public.temperature_logs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.batches (id),
  measured_at timestamptz not null default now(),
  celsius numeric(4,1) not null check (celsius between -30 and 50),
  logged_by uuid not null default auth.uid()
);

create trigger audit_harvest_areas
  after insert or update or delete on public.harvest_areas
  for each row execute function public.audit_row();
create trigger audit_batches
  after insert or update or delete on public.batches
  for each row execute function public.audit_row();
create trigger audit_sorting_checks
  after insert or update or delete on public.sorting_checks
  for each row execute function public.audit_row('batch_id');
create trigger audit_temperature_logs
  after insert or update or delete on public.temperature_logs
  for each row execute function public.audit_row();

alter table public.harvest_areas enable row level security;
alter table public.batches enable row level security;
alter table public.sorting_checks enable row level security;
alter table public.temperature_logs enable row level security;

create policy harvest_areas_select on public.harvest_areas
  for select to authenticated using (public.app_role() is not null);
create policy harvest_areas_insert on public.harvest_areas
  for insert to authenticated with check (public.app_role() = 'owner');
create policy harvest_areas_update on public.harvest_areas
  for update to authenticated
  using (public.app_role() = 'owner') with check (public.app_role() = 'owner');

create policy batches_select on public.batches
  for select to authenticated using (public.app_role() is not null);
create policy batches_insert on public.batches
  for insert to authenticated
  with check (public.app_role() in ('owner', 'picker') and created_by = (select auth.uid()));
create policy batches_update on public.batches
  for update to authenticated
  using (public.app_role() = 'owner') with check (public.app_role() = 'owner');

create policy sorting_checks_select on public.sorting_checks
  for select to authenticated using (public.app_role() is not null);
create policy sorting_checks_insert on public.sorting_checks
  for insert to authenticated
  with check (public.app_role() in ('owner', 'picker') and checked_by = (select auth.uid()));

create policy temperature_logs_select on public.temperature_logs
  for select to authenticated using (public.app_role() is not null);
create policy temperature_logs_insert on public.temperature_logs
  for insert to authenticated
  with check (public.app_role() in ('owner', 'picker') and logged_by = (select auth.uid()));

revoke all on public.harvest_areas, public.batches, public.sorting_checks, public.temperature_logs
  from anon, authenticated;
grant select, insert, update on public.harvest_areas to authenticated;
grant select, insert, update on public.batches to authenticated;
grant select, insert on public.sorting_checks to authenticated;
grant select, insert on public.temperature_logs to authenticated;
