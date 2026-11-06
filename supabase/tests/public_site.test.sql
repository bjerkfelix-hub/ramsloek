begin;
create extension if not exists pgtap with schema extensions;
\ir helpers.psql
select plan(24);

-- fixtures (as postgres)
insert into public.market_days (id, market_date, starts_at, ends_at, place_name, address, published, cancelled) values
  ('00000000-0000-0000-0000-00000000c001', (now() at time zone 'Europe/Oslo')::date,     '10:00', '14:00', 'I dag',    'Torget 1', true,  false),
  ('00000000-0000-0000-0000-00000000c002', (now() at time zone 'Europe/Oslo')::date + 1, '10:00', '14:00', 'I morgen', 'Torget 2', true,  false),
  ('00000000-0000-0000-0000-00000000c003', (now() at time zone 'Europe/Oslo')::date - 1, '10:00', '14:00', 'I går',    'Torget 3', true,  false),
  ('00000000-0000-0000-0000-00000000c004', (now() at time zone 'Europe/Oslo')::date + 2, '10:00', '14:00', 'Skjult',   'Torget 4', false, false),
  ('00000000-0000-0000-0000-00000000c005', (now() at time zone 'Europe/Oslo')::date + 3, '10:00', '14:00', 'Avlyst',   'Torget 5', true,  true);

-- anon: public read of upcoming published days only
select tests.logout();
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select ok(exists(select 1 from public.market_days where id = '00000000-0000-0000-0000-00000000c001'), 'anon sees a published day dated today (Oslo)');
select ok(exists(select 1 from public.market_days where id = '00000000-0000-0000-0000-00000000c002'), 'anon sees a published day dated tomorrow');
select ok(not exists(select 1 from public.market_days where id = '00000000-0000-0000-0000-00000000c003'), 'anon does not see yesterday');
select ok(not exists(select 1 from public.market_days where id = '00000000-0000-0000-0000-00000000c004'), 'anon does not see an unpublished day');
select is((select cancelled from public.market_days where id = '00000000-0000-0000-0000-00000000c005'), true, 'anon sees an upcoming cancelled day with cancelled = true');
select throws_ok(
  $$insert into public.market_days (market_date, starts_at, ends_at, place_name, address)
    values (current_date, '10:00', '14:00', 'x', 'y')$$,
  '42501', null, 'anon cannot insert market_days');
select throws_ok($$update public.market_days set place_name = 'x'$$, '42501', null, 'anon cannot update market_days');
select throws_ok($$select 1 from public.season_signups$$, '42501', null, 'anon cannot select season_signups');

-- picker
reset role;
select tests.login_as('picker') as picker_id \gset
select throws_ok(
  $$insert into public.market_days (market_date, starts_at, ends_at, place_name, address)
    values (current_date, '10:00', '14:00', 'x', 'y')$$,
  '42501', null, 'picker cannot insert market_days');
select ok(not exists(select 1 from public.market_days where id = '00000000-0000-0000-0000-00000000c003'), 'picker does not see past days');
select throws_ok($$select 1 from public.season_signups$$, '42501', null, 'picker cannot select season_signups');
select throws_ok($$select public.purge_unsubscribed_signups()$$, '42501', null, 'picker cannot purge');

-- owner
reset role;
select tests.login_as('owner') as owner_id \gset
select ok(exists(select 1 from public.market_days where id = '00000000-0000-0000-0000-00000000c003'), 'owner sees past days');
select ok(exists(select 1 from public.market_days where id = '00000000-0000-0000-0000-00000000c004'), 'owner sees unpublished days');
insert into public.market_days (id, market_date, starts_at, ends_at, place_name, address)
values ('00000000-0000-0000-0000-00000000c006', current_date + 10, '09:00', '13:00', 'Eier', 'Torget 6');
select is((select created_by from public.market_days where id = '00000000-0000-0000-0000-00000000c006'), :'owner_id'::uuid, 'owner insert ok, created_by defaults to the owner');
select throws_ok(
  $$insert into public.market_days (market_date, starts_at, ends_at, place_name, address, created_by)
    values (current_date, '10:00', '14:00', 'x', 'y', '00000000-0000-0000-0000-000000000099')$$,
  '42501', null, 'owner cannot forge created_by');
with u as (update public.market_days set place_name = 'Endret' where id = '00000000-0000-0000-0000-00000000c006' returning 1)
select is((select count(*) from u), 1::bigint, 'owner can update market_days');
select throws_ok(
  $$insert into public.market_days (market_date, starts_at, ends_at, place_name, address)
    values (current_date, '14:00', '14:00', 'x', 'y')$$,
  '23514', null, 'ends_at <= starts_at is refused');
select throws_ok($$delete from public.market_days where id = '00000000-0000-0000-0000-00000000c006'$$, '42501', null, 'owner cannot delete market_days');
select throws_ok($$select 1 from public.season_signups$$, '42501', null, 'owner cannot select season_signups directly');

-- purge, and service_role access (as postgres for fixtures)
select tests.logout();
set local role service_role;
insert into public.season_signups (email, language, consent_text, unsubscribed_at) values
  ('gammel@example.test', 'no', 'samtykke', now() - interval '31 days'),
  ('ny@example.test',     'en', 'consent',  now() - interval '29 days');
select is((select length(unsubscribe_token) from public.season_signups where email = 'gammel@example.test'), 64, 'service_role can insert/select; token is 32-byte hex');
reset role;
select tests.login_as_user(:'owner_id'::uuid);
select is(public.purge_unsubscribed_signups(), 1, 'owner purge deletes the 31-day-old row');
select tests.logout();
select is((select count(*) from public.season_signups where email = 'ny@example.test'), 1::bigint, '29-day-old row is kept');

-- audit
select ok(exists(select 1 from public.audit_log where table_name = 'market_days' and row_id = '00000000-0000-0000-0000-00000000c006' and action = 'INSERT'), 'market_days insert writes an audit_log row');

select * from finish();
rollback;
