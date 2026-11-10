begin;
create extension if not exists pgtap with schema extensions;
\ir helpers.psql
select plan(7);

-- fixtures (as postgres)
insert into public.market_days (id, market_date, starts_at, ends_at, place_name, address, published, cancelled) values
  ('00000000-0000-0000-0000-00000000d001', (now() at time zone 'Europe/Oslo')::date - 3, '10:00', '15:00', 'Past open', 'A', true, false),
  ('00000000-0000-0000-0000-00000000d002', (now() at time zone 'Europe/Oslo')::date - 2, '10:00', '15:00', 'Past cancelled', 'A', true, true),
  ('00000000-0000-0000-0000-00000000d003', (now() at time zone 'Europe/Oslo')::date + 2, '10:00', '15:00', 'Future', 'A', true, false),
  ('00000000-0000-0000-0000-00000000d004', (now() at time zone 'Europe/Oslo')::date - 1, '10:00', '15:00', 'Past unpublished', 'A', false, false),
  ('00000000-0000-0000-0000-00000000d005', (now() at time zone 'Europe/Oslo')::date - 90, '10:00', '15:00', 'Too old', 'A', true, false);

select tests.login_as('seller') as seller_a \gset
select is(
  (select array_agg(place_name order by place_name) from public.takings_market_days()),
  array['Past open', 'Past unpublished'],
  'seller gets past, recent, non-cancelled days (published or not)');

insert into public.market_takings (market_day_id, vipps_ore) values ('00000000-0000-0000-0000-00000000d001', 1000);
select is(
  (select array_agg(place_name) from public.takings_market_days()),
  array['Past unpublished'],
  'a day with active takings is no longer offered');

-- Another seller does not see the taken day either (they cannot read the takings row itself).
select tests.login_as('seller') as seller_b \gset
select is(
  (select array_agg(place_name) from public.takings_market_days()),
  array['Past unpublished'],
  'other sellers do not get days already registered');
select is((select count(*) from public.market_takings), 0::bigint, 'other seller still cannot read the takings');

select tests.login_as('owner') as owner_id \gset
update public.market_takings set voided_at = now(), void_reason = 'Feil dag'
  where market_day_id = '00000000-0000-0000-0000-00000000d001';
select is(
  (select count(*) from public.takings_market_days() where place_name = 'Past open'),
  1::bigint,
  'voiding the takings offers the day again');

select tests.login_as('picker') as picker_id \gset
select throws_ok($$select * from public.takings_market_days()$$, '42501', null, 'pickers are refused');

select tests.logout();
set local role anon;
select throws_ok($$select * from public.takings_market_days()$$, '42501', null, 'anon cannot execute');

select * from finish();
rollback;
