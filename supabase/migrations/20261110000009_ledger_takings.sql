-- Ledger: daily takings, receipt metadata, owner reports and private receipt storage.

create table public.market_takings (
  id uuid primary key default gen_random_uuid(),
  market_day_id uuid not null references public.market_days (id),
  vipps_ore int not null default 0 check (vipps_ore between 0 and 100000000),
  card_ore int not null default 0 check (card_ore between 0 and 100000000),
  cash_ore int not null default 0 check (cash_ore between 0 and 100000000),
  note text,
  created_by uuid not null default auth.uid(),
  created_at timestamptz default now(),
  voided_at timestamptz,
  voided_by uuid,
  void_reason text,
  check ((voided_at is null) = (voided_by is null)),
  check (voided_at is null or length(trim(coalesce(void_reason, ''))) >= 3)
);
create unique index market_takings_day_active on public.market_takings (market_day_id) where voided_at is null;
alter table public.ledger_entries add constraint ledger_entries_takings_fk
  foreign key (takings_id) references public.market_takings (id);

create table public.ledger_receipts (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid references public.ledger_entries (id),
  takings_id uuid references public.market_takings (id),
  storage_key text not null unique,
  file_name text not null,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf')),
  size_bytes int not null check (size_bytes between 1 and 10485760),
  sha256 text not null,
  uploaded_by uuid not null default auth.uid(),
  uploaded_at timestamptz default now(),
  check ((entry_id is null) <> (takings_id is null))
);

create function public.market_takings_guard() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_day public.market_days%rowtype;
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      if coalesce(public.app_role()::text, '') not in ('owner', 'seller')
        or new.created_by is distinct from auth.uid() then
        raise exception 'insufficient_privilege' using errcode = '42501';
      end if;
    end if;
    select * into v_day from public.market_days where id = new.market_day_id;
    if not found then
      raise exception 'market day does not exist' using errcode = '23503';
    end if;
    if v_day.cancelled then raise exception 'TAKINGS_CANCELLED_DAY'; end if;
    if v_day.market_date > (now() at time zone 'Europe/Oslo')::date then
      raise exception 'TAKINGS_FUTURE_DAY';
    end if;
    if new.vipps_ore::bigint + new.card_ore + new.cash_ore <= 0 then
      raise exception 'TAKINGS_EMPTY';
    end if;
    new.created_at := now();
    new.voided_at := null;
    new.voided_by := null;
    new.void_reason := null;
  else
    -- Match entries' trusted-maintenance exception; deletion remains blocked.
    if auth.uid() is null then return new; end if;
    if public.app_role() is distinct from 'owner' then
      raise exception 'insufficient_privilege' using errcode = '42501';
    end if;
    if old.voided_at is not null then raise exception 'LEDGER_VOIDED'; end if;
    if (to_jsonb(new) - array['voided_at', 'void_reason'])
      is distinct from (to_jsonb(old) - array['voided_at', 'void_reason']) then
      raise exception 'LEDGER_IMMUTABLE';
    end if;
    if new.voided_at is not null then
      if length(trim(coalesce(new.void_reason, ''))) < 3 then
        raise exception 'LEDGER_VOID_REASON';
      end if;
      new.voided_by := auth.uid();
    end if;
  end if;
  return new;
end $$;
revoke all on function public.market_takings_guard() from public, anon, authenticated;

create function public.market_takings_to_entries() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.ledger_entries (
    kind, entry_date, category_id, amount_ore, description, payment_method, takings_id, created_by
  )
  select 'income', d.market_date, c.id, a.amount_ore,
    'Dagsoppgjør ' || d.place_name || ' ' || to_char(d.market_date, 'DD.MM.YYYY'),
    a.payment_method, new.id, new.created_by
  from public.market_days d
  cross join public.ledger_categories c
  cross join (values ('vipps', new.vipps_ore), ('card', new.card_ore), ('cash', new.cash_ore))
    as a(payment_method, amount_ore)
  where d.id = new.market_day_id and c.system_key = 'market_sales' and a.amount_ore > 0;
  return null;
end $$;
revoke all on function public.market_takings_to_entries() from public, anon, authenticated;

create function public.market_takings_void_entries() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.ledger_entries set voided_at = new.voided_at, void_reason = new.void_reason
  where takings_id = new.id and voided_at is null;
  return null;
end $$;
revoke all on function public.market_takings_void_entries() from public, anon, authenticated;

create function public.ledger_receipts_guard() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;
  if auth.uid() is not null then
    if coalesce(public.app_role()::text, '') not in ('owner', 'seller')
      or new.uploaded_by is distinct from auth.uid() then
      raise exception 'insufficient_privilege' using errcode = '42501';
    end if;
  end if;
  -- Raise before RETURNING's RLS visibility check can mask the XOR violation.
  if (new.entry_id is null) = (new.takings_id is null) then
    raise exception 'receipt must have exactly one parent' using errcode = '23514';
  end if;
  if public.app_role() = 'seller' then
    if not (exists (
      select 1 from public.ledger_entries e where e.id = new.entry_id
        and e.created_by = auth.uid() and e.voided_at is null and e.created_at > now() - interval '30 days'
    ) or exists (
      select 1 from public.market_takings t where t.id = new.takings_id
        and t.created_by = auth.uid() and t.voided_at is null and t.created_at > now() - interval '30 days'
    )) then
      raise exception 'RECEIPT_PARENT_INVALID';
    end if;
  end if;
  new.uploaded_at := now();
  return new;
end $$;
revoke all on function public.ledger_receipts_guard() from public, anon, authenticated;

create trigger market_takings_guard before insert or update on public.market_takings
  for each row execute function public.market_takings_guard();
create trigger market_takings_to_entries after insert on public.market_takings
  for each row execute function public.market_takings_to_entries();
create trigger market_takings_void_entries after update on public.market_takings
  for each row when (old.voided_at is null and new.voided_at is not null)
  execute function public.market_takings_void_entries();
create trigger ledger_receipts_guard before insert or update on public.ledger_receipts
  for each row execute function public.ledger_receipts_guard();
create trigger market_takings_no_delete before delete on public.market_takings
  for each row execute function public.ledger_no_delete();
create trigger ledger_receipts_no_delete before delete on public.ledger_receipts
  for each row execute function public.ledger_no_delete();
create trigger audit_market_takings after insert or update on public.market_takings
  for each row execute function public.audit_row_with_old();
create trigger audit_ledger_receipts after insert or update on public.ledger_receipts
  for each row execute function public.audit_row_with_old();

alter table public.market_takings enable row level security;
alter table public.ledger_receipts enable row level security;
create policy market_takings_select on public.market_takings for select to authenticated
  using (public.app_role() = 'owner' or (public.app_role() = 'seller'
    and created_by = auth.uid() and created_at > now() - interval '30 days'));
create policy market_takings_insert on public.market_takings for insert to authenticated
  with check (public.app_role() in ('owner', 'seller'));
create policy market_takings_update on public.market_takings for update to authenticated
  using (public.app_role() = 'owner') with check (public.app_role() = 'owner');
create policy ledger_receipts_select on public.ledger_receipts for select to authenticated
  using (public.app_role() = 'owner' or (public.app_role() = 'seller' and (
    exists (select 1 from public.ledger_entries e where e.id = ledger_receipts.entry_id)
    or exists (select 1 from public.market_takings t where t.id = ledger_receipts.takings_id)
  )));
create policy ledger_receipts_insert on public.ledger_receipts for insert to authenticated
  with check (public.app_role() in ('owner', 'seller'));
revoke all on public.market_takings, public.ledger_receipts from public, anon, authenticated;
grant select, insert, update on public.market_takings to authenticated;
grant select, insert on public.ledger_receipts to authenticated;

create function public.require_owner() returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if public.app_role() is distinct from 'owner' then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;
end $$;
revoke all on function public.require_owner() from public, anon, authenticated;
grant execute on function public.require_owner() to authenticated;

create function public.ledger_totals(p_from date, p_to date)
returns table(income_ore bigint, expense_ore bigint, profit_ore bigint)
language plpgsql stable security invoker set search_path = ''
as $$
begin
  perform public.require_owner();
  return query
    select s.income, s.expense, s.income - s.expense from (
      select coalesce(sum(e.amount_ore) filter (where e.kind = 'income'), 0) as income,
        coalesce(sum(e.amount_ore) filter (where e.kind = 'expense'), 0) as expense
      from public.ledger_entries e
      where e.entry_date between p_from and p_to and e.voided_at is null
    ) s;
end $$;
revoke all on function public.ledger_totals(date, date) from public, anon, authenticated;
grant execute on function public.ledger_totals(date, date) to authenticated;

create function public.ledger_by_category(p_from date, p_to date)
returns table(kind text, category text, account_no text, total_ore bigint)
language plpgsql stable security invoker set search_path = ''
as $$
begin
  perform public.require_owner();
  return query
    select e.kind, c.name, c.account_no, sum(e.amount_ore)
    from public.ledger_entries e join public.ledger_categories c on c.id = e.category_id
    where e.entry_date between p_from and p_to and e.voided_at is null
    group by e.kind, c.name, c.account_no
    order by e.kind, c.account_no, c.name;
end $$;
revoke all on function public.ledger_by_category(date, date) from public, anon, authenticated;
grant execute on function public.ledger_by_category(date, date) to authenticated;

create function public.ledger_by_month(p_from date, p_to date)
returns table(month date, income_ore bigint, expense_ore bigint, profit_ore bigint)
language plpgsql stable security invoker set search_path = ''
as $$
begin
  perform public.require_owner();
  return query
    select s.month, s.income, s.expense, s.income - s.expense from (
      select date_trunc('month', e.entry_date::timestamp)::date as month,
        coalesce(sum(e.amount_ore) filter (where e.kind = 'income'), 0) as income,
        coalesce(sum(e.amount_ore) filter (where e.kind = 'expense'), 0) as expense
      from public.ledger_entries e
      where e.entry_date between p_from and p_to and e.voided_at is null
      group by date_trunc('month', e.entry_date::timestamp)::date
    ) s order by s.month;
end $$;
revoke all on function public.ledger_by_month(date, date) from public, anon, authenticated;
grant execute on function public.ledger_by_month(date, date) to authenticated;

create function public.mva_meter()
returns table(income_ore bigint, limit_ore bigint, window_from date)
language plpgsql stable security invoker set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Europe/Oslo')::date;
  v_from date := (v_today - interval '12 months')::date;
begin
  perform public.require_owner();
  return query
    select coalesce(sum(e.amount_ore), 0), 5000000::bigint, v_from
    from public.ledger_entries e
    where e.kind = 'income' and e.voided_at is null and e.entry_date > v_from and e.entry_date <= v_today;
end $$;
revoke all on function public.mva_meter() from public, anon, authenticated;
grant execute on function public.mva_meter() to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do nothing;
-- No storage.objects policies: bytes are accessed only by the server's service-role client.
