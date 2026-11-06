-- Foundation: roles, profiles, settings, number series, audit log.

create type public.app_role as enum ('owner', 'picker', 'seller');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  role public.app_role not null,
  active boolean not null default true,
  created_at timestamptz default now()
);

-- Role of the calling user, or null when unknown/inactive.
create function public.app_role() returns public.app_role
language sql stable security definer set search_path = ''
as $$
  select p.role from public.profiles p where p.id = auth.uid() and p.active
$$;
revoke all on function public.app_role() from public, anon;
grant execute on function public.app_role() to authenticated;

-- Sign-up is disabled; only admin invites set the metadata used here.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    coalesce(new.raw_user_meta_data ->> 'role', 'picker')::public.app_role
  );
  return new;
end $$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.settings (
  id boolean primary key default true check (id),
  company_name text,
  org_nr text,
  address text,
  gs1_company_prefix text,
  lot_prefix text not null default 'RL',
  best_before_warning_days int not null default 1
);
insert into public.settings (id) values (true);

create table public.number_series (
  series text not null,
  year int not null,
  last int not null,
  primary key (series, year)
);

create function public.next_number(p_series text, p_year int) returns int
language sql security definer set search_path = ''
as $$
  insert into public.number_series as ns (series, year, last)
  values (p_series, p_year, 1)
  on conflict (series, year) do update set last = ns.last + 1
  returning last
$$;
revoke all on function public.next_number(text, int) from public, anon;
grant execute on function public.next_number(text, int) to authenticated;

create table public.audit_log (
  id bigserial primary key,
  at timestamptz default now(),
  actor uuid,
  table_name text,
  row_id text,
  action text,
  data jsonb
);

create function public.audit_row() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_row jsonb := to_jsonb(case when tg_op = 'DELETE' then old else new end);
begin
  insert into public.audit_log (actor, table_name, row_id, action, data)
  values (auth.uid(), tg_table_name, v_row ->> 'id', tg_op, v_row);
  return null;
end $$;
revoke all on function public.audit_row() from public, anon, authenticated;

create trigger audit_profiles
  after insert or update or delete on public.profiles
  for each row execute function public.audit_row();
create trigger audit_settings
  after insert or update or delete on public.settings
  for each row execute function public.audit_row();

-- Row level security
alter table public.profiles enable row level security;
alter table public.settings enable row level security;
alter table public.number_series enable row level security;
alter table public.audit_log enable row level security;

create policy profiles_select on public.profiles
  for select to authenticated using (true);
create policy profiles_update on public.profiles
  for update to authenticated
  using (public.app_role() = 'owner') with check (public.app_role() = 'owner');

create policy settings_select on public.settings
  for select to authenticated using (true);
create policy settings_update on public.settings
  for update to authenticated
  using (public.app_role() = 'owner') with check (public.app_role() = 'owner');

create policy audit_log_select on public.audit_log
  for select to authenticated using (public.app_role() = 'owner');

-- Table privileges: least privilege on top of RLS.
revoke all on public.profiles, public.settings, public.number_series, public.audit_log
  from anon, authenticated;
revoke all on sequence public.audit_log_id_seq from anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select, update on public.settings to authenticated;
grant select on public.audit_log to authenticated;
