begin;
create extension if not exists pgtap with schema extensions;
\ir helpers.psql
select plan(16);

-- fixtures (as postgres)
insert into public.harvest_areas (id, name) values ('00000000-0000-0000-0000-0000000000a1', 'Testområde');
insert into public.products (id, name, net_weight_g, unit_kind, gtin, shelf_life_days)
values ('00000000-0000-0000-0000-0000000000d1', 'Testpose 100 g', 100, 'consumer', null, 6);

-- picker creates a batch with a forged created_at
select tests.login_as('picker') as picker_id \gset
insert into public.batches (id, harvested_at, area_id, pickers, gross_weight_g, created_at)
values ('00000000-0000-0000-0000-0000000000b1', '2027-04-20 10:00+02',
        '00000000-0000-0000-0000-0000000000a1', 'Kari', 5000, '2020-01-01');
select ok((select created_at from public.batches where id = '00000000-0000-0000-0000-0000000000b1') > now() - interval '1 minute',
  'client-supplied batches.created_at is overwritten');

-- server-set timestamps
insert into public.sorting_checks (batch_id, checked_at) values ('00000000-0000-0000-0000-0000000000b1', '2020-01-01');
select ok((select checked_at from public.sorting_checks where batch_id = '00000000-0000-0000-0000-0000000000b1') > now() - interval '1 minute',
  'client-supplied checked_at is overwritten');
insert into public.packings (id, batch_id, product_id, units, packed_at)
values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000d1', 10, '2020-01-01');
select ok((select packed_at from public.packings where id = '00000000-0000-0000-0000-0000000000e1') > now() - interval '1 minute',
  'client-supplied packed_at is overwritten');
insert into public.waste_records (id, batch_id, weight_g, reason, created_at)
values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000b1', 500, 'visnet', '2020-01-01');
select ok((select created_at from public.waste_records where id = '00000000-0000-0000-0000-0000000000f1') > now() - interval '1 minute',
  'client-supplied waste_records.created_at is overwritten');

-- temperature measured_at must not be in the future
select throws_ok(
  $$insert into public.temperature_logs (batch_id, celsius, measured_at)
    values ('00000000-0000-0000-0000-0000000000b1', 3, now() + interval '1 hour')$$,
  'P0001', 'FUTURE_TIME', 'future measured_at is refused');
select lives_ok(
  $$insert into public.temperature_logs (batch_id, celsius, measured_at)
    values ('00000000-0000-0000-0000-0000000000b1', 3, now() - interval '2 hours')$$,
  'past measured_at is accepted');

-- picker cannot update batches
with u as (update public.batches set notes = 'x' returning 1)
select is((select count(*) from u), 0::bigint, 'picker update affects 0 rows');

-- owner corrections: 5000 g gross, 1000 packed + 500 loose waste = 1500 used
select tests.login_as('owner');
with u as (update public.batches set notes = 'rettet' where id = '00000000-0000-0000-0000-0000000000b1' returning 1)
select is((select count(*) from u), 1::bigint, 'owner can update notes');
select is((select notes from public.batches where id = '00000000-0000-0000-0000-0000000000b1'), 'rettet', 'notes changed');
update public.batches set gross_weight_g = 6000 where id = '00000000-0000-0000-0000-0000000000b1';
select is((select gross_weight_g from public.batches where id = '00000000-0000-0000-0000-0000000000b1'), 6000, 'owner can raise gross weight');
update public.batches set gross_weight_g = 1500 where id = '00000000-0000-0000-0000-0000000000b1';
select is((select gross_weight_g from public.batches where id = '00000000-0000-0000-0000-0000000000b1'), 1500, 'gross weight equal to used grams is allowed');
select throws_ok(
  $$update public.batches set gross_weight_g = 1499 where id = '00000000-0000-0000-0000-0000000000b1'$$,
  'P0001', 'WEIGHT_BELOW_USED', 'gross weight below packed + wasted is refused');
select throws_ok(
  $$update public.batches set lot_number = 'HACK' where id = '00000000-0000-0000-0000-0000000000b1'$$,
  '42501', null, 'owner cannot update lot_number');
select throws_ok(
  $$update public.batches set harvested_at = now() where id = '00000000-0000-0000-0000-0000000000b1'$$,
  '42501', null, 'owner cannot update harvested_at');

-- lot prefix constraint
select tests.logout();
select throws_ok($$update public.settings set lot_prefix = 'rl-x'$$, '23514', null, 'lowercase/invalid lot prefix is refused');
select lives_ok($$update public.settings set lot_prefix = 'AB1'$$, 'valid lot prefix is accepted');

select * from finish();
rollback;
