-- Public writes follow season_signups: validated, rate-limited server actions using service_role.
create table public.consumer_interests (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 100),
  email text not null unique check (email = lower(btrim(email)) and length(email) between 3 and 254 and email ~ '^[^[:space:]@]+@[^[:space:]@.]+(\.[^[:space:]@.]+)+$'),
  phone text not null default '' check (length(phone) <= 50 and (phone = '' or phone ~ '^\+?[0-9 ()/.\-]{3,50}$')),
  bags integer not null check (bags between 1 and 50),
  comment text not null default '' check (length(comment) <= 1000),
  language text not null check (language in ('no', 'en')),
  consent_text text not null check (length(btrim(consent_text)) between 1 and 2000),
  consented_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create table public.business_inquiries (
  id uuid primary key default gen_random_uuid(),
  company text not null check (length(btrim(company)) between 1 and 100),
  contact_name text not null check (length(btrim(contact_name)) between 1 and 100),
  email text not null check (email = lower(btrim(email)) and length(email) between 3 and 254 and email ~ '^[^[:space:]@]+@[^[:space:]@.]+(\.[^[:space:]@.]+)+$'),
  phone text not null default '' check (length(phone) <= 50 and (phone = '' or phone ~ '^\+?[0-9 ()/.\-]{3,50}$')),
  type text not null check (type in ('restaurant', 'grossist', 'butikk', 'annet')),
  weekly_quantity text not null default '' check (length(weekly_quantity) <= 100),
  message text not null check (length(btrim(message)) between 1 and 2000),
  language text not null check (language in ('no', 'en')),
  consent_text text not null check (length(btrim(consent_text)) between 1 and 2000),
  consented_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  answered_by uuid references public.profiles(id),
  check ((answered_at is null) = (answered_by is null))
);
create index consumer_interests_consented_at on public.consumer_interests(consented_at desc);
create index business_inquiries_created_at on public.business_inquiries(created_at desc);

alter table public.consumer_interests enable row level security;
alter table public.business_inquiries enable row level security;
revoke all on public.consumer_interests, public.business_inquiries from anon, authenticated;
grant select, update, delete on public.consumer_interests, public.business_inquiries to authenticated;
create policy consumer_interests_owner_select on public.consumer_interests for select to authenticated using (public.app_role() = 'owner');
create policy consumer_interests_owner_update on public.consumer_interests for update to authenticated using (public.app_role() = 'owner') with check (public.app_role() = 'owner');
create policy consumer_interests_owner_delete on public.consumer_interests for delete to authenticated using (public.app_role() = 'owner');
create policy business_inquiries_owner_select on public.business_inquiries for select to authenticated using (public.app_role() = 'owner');
create policy business_inquiries_owner_update on public.business_inquiries for update to authenticated using (public.app_role() = 'owner') with check (public.app_role() = 'owner');
create policy business_inquiries_owner_delete on public.business_inquiries for delete to authenticated using (public.app_role() = 'owner');

-- Audit actions without retaining form contents after privacy deletion.
-- audit_row_with_old supports DELETE, but stores all personal data indefinitely.
create function public.audit_public_contact() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_log(actor, table_name, row_id, action, data)
  values (auth.uid(), tg_table_name, (case when tg_op = 'DELETE' then old.id else new.id end)::text,
    tg_op, jsonb_build_object('operation', tg_op));
  return null;
end $$;
revoke all on function public.audit_public_contact() from public, anon, authenticated;
create trigger consumer_interests_audit after insert or update or delete on public.consumer_interests for each row execute function public.audit_public_contact();
create trigger business_inquiries_audit after insert or update or delete on public.business_inquiries for each row execute function public.audit_public_contact();

create function public.public_consumer_products()
returns table(name text, net_weight_g integer, unit_kind public.unit_kind)
language sql stable security definer set search_path = '' as $$
  select p.name, p.net_weight_g, p.unit_kind from public.products p
  where p.active and p.unit_kind = 'consumer' order by p.net_weight_g, p.name
$$;
revoke all on function public.public_consumer_products() from public;
grant execute on function public.public_consumer_products() to anon, authenticated;

-- The local season runs through June; keep autumn/winter interest for the following spring.
create function public.purge_public_contacts_system() returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.consumer_interests where consented_at < (
    make_date(
      extract(year from now() at time zone 'Europe/Oslo')::int
        - case when extract(month from now() at time zone 'Europe/Oslo') < 7 then 1 else 0 end,
      7, 1
    )::timestamp at time zone 'Europe/Oslo'
  );
  delete from public.business_inquiries where created_at < now() - interval '12 months';
end $$;
revoke all on function public.purge_public_contacts_system() from public, anon, authenticated;
select cron.schedule('purge-public-contacts', '27 3 * * *', $$select public.purge_public_contacts_system()$$);
