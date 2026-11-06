-- Step A: public site — market calendar and season sign-ups.

create table public.market_days (
  id          uuid primary key default gen_random_uuid(),
  market_date date not null,
  starts_at   time not null,
  ends_at     time not null check (ends_at > starts_at),
  place_name  text not null,
  address     text not null,
  note_no     text,
  note_en     text,
  published   boolean not null default true,
  cancelled   boolean not null default false,
  created_by  uuid default auth.uid(),
  created_at  timestamptz default now()
);
create index market_days_date_idx on public.market_days (market_date);

create trigger audit_market_days
  after insert or update or delete on public.market_days
  for each row execute function public.audit_row();

alter table public.market_days enable row level security;

create policy market_days_public_select on public.market_days
  for select to anon, authenticated
  using (published and market_date >= (now() at time zone 'Europe/Oslo')::date);
create policy market_days_owner_select on public.market_days
  for select to authenticated using (public.app_role() = 'owner');
create policy market_days_owner_insert on public.market_days
  for insert to authenticated
  with check (public.app_role() = 'owner' and created_by = (select auth.uid()));
create policy market_days_owner_update on public.market_days
  for update to authenticated
  using (public.app_role() = 'owner') with check (public.app_role() = 'owner');

revoke all on public.market_days from anon, authenticated;
grant select on public.market_days to anon, authenticated;
grant insert, update on public.market_days to authenticated;

-- Season sign-ups: written only by the server (service role); no client access.
create table public.season_signups (
  id                uuid primary key default gen_random_uuid(),
  email             text not null unique check (email = lower(email)),
  language          text not null check (language in ('no', 'en')),
  consent_text      text not null,
  consented_at      timestamptz not null default now(),
  unsubscribe_token text not null unique default encode(extensions.gen_random_bytes(32), 'hex'),
  unsubscribed_at   timestamptz
);

alter table public.season_signups enable row level security;
revoke all on public.season_signups from anon, authenticated;

create function public.purge_unsubscribed_signups() returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_count int;
begin
  if public.app_role() is distinct from 'owner' then
    raise exception 'owner only' using errcode = '42501';
  end if;
  delete from public.season_signups
  where unsubscribed_at < now() - interval '30 days';
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke all on function public.purge_unsubscribed_signups() from public, anon;
grant execute on function public.purge_unsubscribed_signups() to authenticated;
