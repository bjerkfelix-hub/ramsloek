begin;
create extension if not exists pgtap with schema extensions;
\ir helpers.psql
select plan(22);

-- fixtures (as postgres)
insert into public.harvest_areas (id, name) values ('00000000-0000-0000-0000-0000000000a1', 'Testområde');

-- picker: lot numbering
select tests.login_as('picker') as picker_id \gset
insert into public.batches (id, harvested_at, area_id, pickers, gross_weight_g)
values ('00000000-0000-0000-0000-0000000000b1', '2027-04-20 10:00+02',
        '00000000-0000-0000-0000-0000000000a1', 'Kari', 5000);
select is((select lot_number from public.batches where id = '00000000-0000-0000-0000-0000000000b1'),
  'RL-27-001', 'first batch of 2027 gets RL-27-001');
select is((select harvest_date from public.batches where id = '00000000-0000-0000-0000-0000000000b1'),
  '2027-04-20'::date, 'harvest_date is derived from harvested_at');

insert into public.batches (id, harvested_at, area_id, pickers, gross_weight_g)
values ('00000000-0000-0000-0000-0000000000b2', '2027-04-20 12:00+02',
        '00000000-0000-0000-0000-0000000000a1', 'Kari', 3000);
select is((select lot_number from public.batches where id = '00000000-0000-0000-0000-0000000000b2'),
  'RL-27-002', 'second batch same year gets RL-27-002');

insert into public.batches (id, harvested_at, area_id, pickers, gross_weight_g)
values ('00000000-0000-0000-0000-0000000000b3', '2027-04-20 23:30:00+00',
        '00000000-0000-0000-0000-0000000000a1', 'Kari', 3000);
select is((select harvest_date from public.batches where id = '00000000-0000-0000-0000-0000000000b3'),
  '2027-04-21'::date, 'harvest_date uses the Oslo calendar date');

-- supplied lot_number / harvest_date are overridden
insert into public.batches (id, harvested_at, area_id, pickers, gross_weight_g, lot_number, harvest_date)
values ('00000000-0000-0000-0000-0000000000b4', '2027-04-22 10:00+02',
        '00000000-0000-0000-0000-0000000000a1', 'Kari', 3000, 'FAKE', '2020-01-01');
select is((select lot_number || ' ' || harvest_date from public.batches where id = '00000000-0000-0000-0000-0000000000b4'),
  'RL-27-004 2027-04-22', 'client-supplied lot_number/harvest_date are overwritten');

-- idempotent insert
insert into public.batches (id, harvested_at, area_id, pickers, gross_weight_g)
values ('00000000-0000-0000-0000-0000000000c1', '2027-04-23 10:00+02',
        '00000000-0000-0000-0000-0000000000a1', 'Kari', 1000)
on conflict (id) do nothing;
select lot_number as first_lot from public.batches where id = '00000000-0000-0000-0000-0000000000c1' \gset
insert into public.batches (id, harvested_at, area_id, pickers, gross_weight_g)
values ('00000000-0000-0000-0000-0000000000c1', '2027-04-23 10:00+02',
        '00000000-0000-0000-0000-0000000000a1', 'Kari', 1000)
on conflict (id) do nothing;
select is((select count(*) from public.batches where id = '00000000-0000-0000-0000-0000000000c1'),
  1::bigint, 'duplicate id insert yields exactly one row');
select is((select lot_number from public.batches where id = '00000000-0000-0000-0000-0000000000c1'),
  :'first_lot', 'duplicate id insert keeps the first lot_number');

-- picker cannot delete / update batches
select throws_ok('delete from public.batches', '42501', null, 'picker has no delete privilege');
with u as (update public.batches set notes = 'x' returning 1)
select is((select count(*) from u), 0::bigint, 'picker update on batches affects 0 rows');

-- sorting checks
insert into public.sorting_checks (batch_id) values ('00000000-0000-0000-0000-0000000000b1');
select throws_ok(
  $$insert into public.sorting_checks (batch_id) values ('00000000-0000-0000-0000-0000000000b1')$$,
  '23505', null, 'second sorting check for the same batch is a unique violation');
select is((select statement from public.sorting_checks where batch_id = '00000000-0000-0000-0000-0000000000b1'),
  'Sortert og kontrollert for liljekonvall og andre arter', 'sorting check default statement');

-- temperature
insert into public.temperature_logs (batch_id, celsius) values ('00000000-0000-0000-0000-0000000000b1', 4.5);
select throws_ok(
  $$insert into public.temperature_logs (batch_id, celsius) values ('00000000-0000-0000-0000-0000000000b1', 80)$$,
  '23514', null, 'celsius 80 violates the check constraint');

-- actor spoofing
select throws_ok(
  $$insert into public.batches (id, harvested_at, area_id, pickers, gross_weight_g, created_by)
    values (gen_random_uuid(), '2027-04-24 10:00+02', '00000000-0000-0000-0000-0000000000a1', 'X', 100,
            '00000000-0000-0000-0000-0000000000ff')$$,
  '42501', null, 'picker cannot set created_by to another user');
insert into public.batches (id, harvested_at, area_id, pickers, gross_weight_g)
values ('00000000-0000-0000-0000-0000000000b5', '2027-04-24 10:00+02',
        '00000000-0000-0000-0000-0000000000a1', 'Kari', 100);
select throws_ok(
  $$insert into public.sorting_checks (batch_id, checked_by)
    values ('00000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-0000000000ff')$$,
  '42501', null, 'picker cannot set checked_by to another user');
select throws_ok(
  $$insert into public.temperature_logs (batch_id, celsius, logged_by)
    values ('00000000-0000-0000-0000-0000000000b5', 4, '00000000-0000-0000-0000-0000000000ff')$$,
  '42501', null, 'picker cannot set logged_by to another user');

-- picker cannot create areas or call next_number
select throws_ok(
  $$insert into public.harvest_areas (name) values ('Testområde 2')$$,
  '42501', null, 'picker cannot insert harvest areas');
select throws_ok($$select public.next_number('lot', 2027)$$, '42501', null,
  'picker cannot call next_number directly');
select tests.logout();

-- audit: sorting_checks row_id is the batch id
select is((select row_id from public.audit_log where table_name = 'sorting_checks' and action = 'INSERT'),
  '00000000-0000-0000-0000-0000000000b1', 'sorting_checks audit row_id is the batch_id');

-- seller
select tests.login_as('seller');
select is((select count(*) from public.batches), 6::bigint, 'seller can read batches');
select throws_ok(
  $$insert into public.batches (id, harvested_at, area_id, pickers, gross_weight_g)
    values (gen_random_uuid(), '2027-04-24 10:00+02', '00000000-0000-0000-0000-0000000000a1', 'X', 100)$$,
  '42501', null, 'seller cannot insert batches');
select tests.logout();

-- owner can correct notes; lot 1000 formatting
select tests.login_as('owner');
with u as (update public.batches set notes = 'rettet' where id = '00000000-0000-0000-0000-0000000000b1' returning 1)
select is((select count(*) from u), 1::bigint, 'owner can update batch notes');
select tests.logout();

update public.number_series set last = 999 where series = 'lot' and year = 2027;
select tests.login_as('picker');
insert into public.batches (id, harvested_at, area_id, pickers, gross_weight_g)
values ('00000000-0000-0000-0000-0000000000b9', '2027-05-01 10:00+02',
        '00000000-0000-0000-0000-0000000000a1', 'Kari', 100);
select is((select lot_number from public.batches where id = '00000000-0000-0000-0000-0000000000b9'),
  'RL-27-1000', '1000th lot of the year is RL-27-1000');
select tests.logout();

select * from finish();
rollback;
