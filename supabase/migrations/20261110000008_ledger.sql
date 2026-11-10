-- Ledger (subledger for ramsløk): categories, entries, audit with old values.

create function public.audit_row_with_old() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.audit_log (actor, table_name, row_id, action, data)
  values (auth.uid(), tg_table_name, new.id::text, tg_op,
    case when tg_op = 'INSERT' then jsonb_build_object('new', to_jsonb(new))
      else jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new)) end);
  return null;
end $$;
revoke all on function public.audit_row_with_old() from public, anon, authenticated;

create function public.ledger_no_delete() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  raise exception 'LEDGER_NO_DELETE';
end $$;
revoke all on function public.ledger_no_delete() from public, anon, authenticated;

create table public.ledger_categories (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('income', 'expense')),
  name text not null,
  account_no text not null check (account_no ~ '^[0-9]{4}$'),
  active boolean not null default true,
  sort int not null default 0,
  system_key text unique
);
create unique index ledger_categories_kind_name on public.ledger_categories (kind, lower(name));

create table public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  kind text not null check (kind in ('income', 'expense')),
  entry_date date not null,
  category_id uuid not null references public.ledger_categories (id),
  amount_ore int not null check (amount_ore > 0 and amount_ore <= 100000000),
  counterparty text,
  description text not null check (length(description) between 1 and 200),
  payment_method text not null check (payment_method in ('vipps', 'card', 'cash', 'bank', 'private', 'unpaid')),
  due_date date,
  settled_at timestamptz,
  settled_by uuid,
  -- Task 2 adds the foreign key once market_takings exists.
  takings_id uuid,
  created_by uuid not null default auth.uid(),
  created_at timestamptz default now(),
  voided_at timestamptz,
  voided_by uuid,
  void_reason text,
  client_key uuid unique,
  check (kind = 'expense' or payment_method in ('vipps', 'card', 'cash', 'bank')),
  check (payment_method <> 'unpaid' or due_date is not null),
  check ((voided_at is null) = (voided_by is null)),
  check (voided_at is null or length(trim(coalesce(void_reason, ''))) >= 3)
);

insert into public.ledger_categories (kind, name, account_no, sort, system_key) values
  ('income', 'Salg marked', '3000', 10, 'market_sales'),
  ('income', 'Salg restaurant/butikk', '3000', 20, null),
  ('income', 'Annen inntekt', '3900', 30, null),
  ('expense', 'Emballasje', '4300', 10, null),
  ('expense', 'Etiketter og trykk', '4300', 20, null),
  ('expense', 'Standleie', '6300', 30, null),
  ('expense', 'Utstyr og verktøy', '6540', 40, null),
  ('expense', 'Drivstoff og transport', '7000', 50, null),
  ('expense', 'Bompenger og parkering', '7140', 60, null),
  ('expense', 'Reklame og nettside', '7320', 70, null),
  ('expense', 'Gebyrer (Vipps, kort, bank)', '7770', 80, null),
  ('expense', 'Annet', '7790', 90, null);

create function public.ledger_entries_number() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  y int := extract(year from new.entry_date)::int;
  n text;
begin
  n := public.next_number('ledger', y)::text;
  new.number := 'R-' || y || '-' || lpad(n, greatest(3, length(n)), '0');
  return new;
end $$;
revoke all on function public.ledger_entries_number() from public, anon, authenticated;

create function public.ledger_entries_guard() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_category public.ledger_categories%rowtype;
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      if coalesce(public.app_role()::text, '') not in ('owner', 'seller') then
        raise exception 'insufficient_privilege' using errcode = '42501';
      end if;
      if new.created_by is distinct from auth.uid() then
        raise exception 'insufficient_privilege' using errcode = '42501';
      end if;
    end if;
    if new.takings_id is not null and pg_trigger_depth() < 2 then
      raise exception 'LEDGER_INCOME_VIA_TAKINGS';
    end if;
    if new.kind = 'income' and new.takings_id is null
      and public.app_role() is distinct from 'owner' and auth.uid() is not null then
      raise exception 'LEDGER_INCOME_VIA_TAKINGS';
    end if;
    new.voided_at := null;
    new.voided_by := null;
    new.void_reason := null;
    new.settled_at := null;
    new.settled_by := null;
    new.created_at := now();
  else
    -- Trusted local maintenance may correct fixtures; deletes are always blocked.
    if auth.uid() is null then return new; end if;
    if public.app_role() is distinct from 'owner' then
      raise exception 'insufficient_privilege' using errcode = '42501';
    end if;
    if old.voided_at is not null then raise exception 'LEDGER_VOIDED'; end if;
    if new.number is distinct from old.number or new.kind is distinct from old.kind
      or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at
      or new.takings_id is distinct from old.takings_id or new.client_key is distinct from old.client_key then
      raise exception 'LEDGER_IMMUTABLE';
    end if;
    -- All takings business fields stay fixed; only void metadata may change.
    if old.takings_id is not null
      and (to_jsonb(new) - array['voided_at', 'voided_by', 'void_reason'])
        is distinct from (to_jsonb(old) - array['voided_at', 'voided_by', 'void_reason']) then
      raise exception 'LEDGER_IMMUTABLE';
    end if;
    if new.voided_at is not null then
      if length(coalesce(trim(new.void_reason), '')) < 3 then raise exception 'LEDGER_VOID_REASON'; end if;
      new.voided_by := auth.uid();
    end if;
    if new.settled_at is not null and old.settled_at is null then
      if new.payment_method not in ('unpaid', 'private') then raise exception 'LEDGER_SETTLE_INVALID'; end if;
      new.settled_by := auth.uid();
    end if;
  end if;

  -- On updates revalidate only changed fields: deactivating a category must not
  -- prevent correction, settlement or voiding of existing entries in it.
  if tg_op = 'INSERT' or new.entry_date is distinct from old.entry_date then
    if new.entry_date > (now() at time zone 'Europe/Oslo')::date + 1 then
      raise exception 'LEDGER_FUTURE_DATE';
    end if;
  end if;
  if tg_op = 'INSERT' or new.category_id is distinct from old.category_id then
    select * into v_category from public.ledger_categories where id = new.category_id;
    if not found or v_category.kind is distinct from new.kind then
      raise exception 'LEDGER_CATEGORY_MISMATCH';
    end if;
    if not v_category.active then raise exception 'LEDGER_CATEGORY_INACTIVE'; end if;
  end if;
  return new;
end $$;
revoke all on function public.ledger_entries_guard() from public, anon, authenticated;

create function public.ledger_categories_guard() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is not null and public.app_role() is distinct from 'owner' then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and (new.kind is distinct from old.kind or new.system_key is distinct from old.system_key) then
    raise exception 'LEDGER_IMMUTABLE';
  end if;
  return new;
end $$;
revoke all on function public.ledger_categories_guard() from public, anon, authenticated;

create trigger ledger_entries_guard before insert or update on public.ledger_entries
  for each row execute function public.ledger_entries_guard();
create trigger ledger_entries_number before insert on public.ledger_entries
  for each row execute function public.ledger_entries_number();
create trigger ledger_categories_guard before insert or update on public.ledger_categories
  for each row execute function public.ledger_categories_guard();
create trigger ledger_entries_no_delete before delete on public.ledger_entries
  for each row execute function public.ledger_no_delete();
create trigger ledger_categories_no_delete before delete on public.ledger_categories
  for each row execute function public.ledger_no_delete();
create trigger audit_ledger_entries after insert or update on public.ledger_entries
  for each row execute function public.audit_row_with_old();
create trigger audit_ledger_categories after insert or update on public.ledger_categories
  for each row execute function public.audit_row_with_old();

alter table public.ledger_categories enable row level security;
alter table public.ledger_entries enable row level security;

create policy ledger_categories_select on public.ledger_categories for select to authenticated
  using (public.app_role() = 'owner' or (public.app_role() = 'seller' and active));
create policy ledger_categories_insert on public.ledger_categories for insert to authenticated
  with check (public.app_role() = 'owner');
create policy ledger_categories_update on public.ledger_categories for update to authenticated
  using (public.app_role() = 'owner') with check (public.app_role() = 'owner');
create policy ledger_entries_select on public.ledger_entries for select to authenticated
  using (public.app_role() = 'owner' or (public.app_role() = 'seller'
    and created_by = auth.uid() and created_at > now() - interval '30 days'));
create policy ledger_entries_insert on public.ledger_entries for insert to authenticated
  with check (public.app_role() in ('owner', 'seller'));
create policy ledger_entries_update on public.ledger_entries for update to authenticated
  using (public.app_role() = 'owner') with check (public.app_role() = 'owner');

revoke all on public.ledger_categories, public.ledger_entries from anon, authenticated;
grant select, insert, update on public.ledger_categories, public.ledger_entries to authenticated;
