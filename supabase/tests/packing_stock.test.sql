begin;
create extension if not exists pgtap with schema extensions;
\ir helpers.psql
select plan(25);

-- fixtures (as postgres)
insert into public.harvest_areas (id, name) values ('00000000-0000-0000-0000-0000000000a1', 'Testområde');
insert into public.products (id, name, net_weight_g, unit_kind, gtin, shelf_life_days)
values ('00000000-0000-0000-0000-0000000000d1', 'Testpose 100 g', 100, 'consumer', null, 6);

select tests.login_as('picker') as picker_id \gset
insert into public.batches (id, harvested_at, area_id, pickers, gross_weight_g) values
 ('00000000-0000-0000-0000-0000000000b1', '2027-04-20 10:00+02', '00000000-0000-0000-0000-0000000000a1', 'Kari', 10000),
 ('00000000-0000-0000-0000-0000000000b2', '2027-04-20 23:30+00', '00000000-0000-0000-0000-0000000000a1', 'Kari', 10000),
 ('00000000-0000-0000-0000-0000000000b3', '2027-04-20 10:00+02', '00000000-0000-0000-0000-0000000000a1', 'Kari', 1000);

-- sorting check guard
select throws_ok(
  $$insert into public.packings (id, batch_id, product_id, units)
    values (gen_random_uuid(), '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000d1', 10)$$,
  'P0001', 'SORTING_CHECK_MISSING', 'packing before sorting check is refused');

insert into public.sorting_checks (batch_id) values
 ('00000000-0000-0000-0000-0000000000b1'),
 ('00000000-0000-0000-0000-0000000000b2'),
 ('00000000-0000-0000-0000-0000000000b3');

insert into public.packings (id, batch_id, product_id, units)
values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000d1', 10);
select is((select weight_g from public.packings where id = '00000000-0000-0000-0000-0000000000e1'),
  1000, 'weight_g = units * net weight');
select is((select best_before from public.packings where id = '00000000-0000-0000-0000-0000000000e1'),
  '2027-04-26'::date, 'best_before = harvest_date + shelf life');
select is((select units from public.stock_movements where packing_id = '00000000-0000-0000-0000-0000000000e1' and kind = 'pack'),
  10, 'one pack movement of +10');
select is(public.batch_remaining_g('00000000-0000-0000-0000-0000000000b1'), 9000, 'remaining 9000 after packing 10');

select throws_ok(
  $$insert into public.packings (id, batch_id, product_id, units)
    values (gen_random_uuid(), '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000d1', 91)$$,
  'P0001', 'NOT_ENOUGH_LEFT', 'over-packing is refused');
insert into public.packings (id, batch_id, product_id, units)
values (gen_random_uuid(), '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000d1', 90);
select is(public.batch_remaining_g('00000000-0000-0000-0000-0000000000b1'), 0, 'packing exactly the rest leaves 0');

-- Oslo date for best_before
insert into public.packings (id, batch_id, product_id, units)
values ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000d1', 1);
select is((select best_before from public.packings where id = '00000000-0000-0000-0000-0000000000e2'),
  '2027-04-27'::date, 'best_before uses the Oslo harvest date');

-- client-supplied weight_g / best_before are overwritten
insert into public.packings (id, batch_id, product_id, units, weight_g, best_before)
values ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000d1', 2, 1, '2020-01-01');
select is((select weight_g || ' ' || best_before from public.packings where id = '00000000-0000-0000-0000-0000000000e3'),
  '200 2027-04-27', 'client-supplied weight_g/best_before are overwritten');

-- waste (units)
insert into public.waste_records (id, batch_id, product_id, units, reason)
values (gen_random_uuid(), '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000d1', 3, 'visnet');
select is((select sum(units) from public.stock_movements
  where batch_id = '00000000-0000-0000-0000-0000000000b1' and product_id = '00000000-0000-0000-0000-0000000000d1'),
  97::bigint, 'stock is 97 after wasting 3');
select throws_ok(
  $$insert into public.waste_records (id, batch_id, product_id, units, reason)
    values (gen_random_uuid(), '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000d1', 98, 'skadet')$$,
  'P0001', 'STOCK_NEGATIVE', 'wasting more than in stock is refused');

-- loose waste
insert into public.waste_records (id, batch_id, weight_g, reason)
values (gen_random_uuid(), '00000000-0000-0000-0000-0000000000b3', 500, 'utgått');
select is(public.batch_remaining_g('00000000-0000-0000-0000-0000000000b3'), 500, 'loose waste reduces remaining');
select throws_ok(
  $$insert into public.waste_records (id, batch_id, weight_g, reason)
    values (gen_random_uuid(), '00000000-0000-0000-0000-0000000000b3', 600, 'annet')$$,
  'P0001', 'NOT_ENOUGH_LEFT', 'loose waste beyond remaining is refused');

-- both units and weight_g
select throws_ok(
  $$insert into public.waste_records (id, batch_id, product_id, units, weight_g, reason)
    values (gen_random_uuid(), '00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000d1', 1, 10, 'annet')$$,
  '23514', null, 'units and weight_g together violate the check');

-- stock_levels
select is((select units || ' ' || lot_number from public.stock_levels
  where batch_id = '00000000-0000-0000-0000-0000000000b1'),
  '97 RL-27-001', 'stock_levels shows units and lot number');

-- actor spoofing
select throws_ok(
  $$insert into public.packings (id, batch_id, product_id, units, packed_by)
    values (gen_random_uuid(), '00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000d1', 1,
            '00000000-0000-0000-0000-0000000000ff')$$,
  '42501', null, 'picker cannot set packed_by to another user');
select throws_ok(
  $$insert into public.waste_records (id, batch_id, weight_g, reason, created_by)
    values (gen_random_uuid(), '00000000-0000-0000-0000-0000000000b2', 10, 'annet',
            '00000000-0000-0000-0000-0000000000ff')$$,
  '42501', null, 'picker cannot set waste created_by to another user');

-- direct movement insert is not allowed
select throws_ok(
  $$insert into public.stock_movements (product_id, batch_id, kind, units)
    values ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b1', 'adjust', 5)$$,
  '42501', null, 'stock_movements cannot be inserted directly');

-- seller
select tests.login_as('seller');
select throws_ok(
  $$insert into public.packings (id, batch_id, product_id, units)
    values (gen_random_uuid(), '00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000d1', 1)$$,
  '42501', null, 'seller cannot pack');
select cmp_ok((select count(*) from public.stock_levels), '>', 0::bigint, 'seller can read stock_levels');

-- seller: cannot probe via insert guards (42501 before any batch state is revealed)
select throws_ok(
  $$insert into public.waste_records (id, batch_id, weight_g, reason, created_by)
    values (gen_random_uuid(), '00000000-0000-0000-0000-0000000000b3', 100000, 'annet', auth.uid())$$,
  '42501', null, 'seller cannot probe waste guard');
select throws_ok(
  $$insert into public.packings (id, batch_id, product_id, units, packed_by)
    values (gen_random_uuid(), gen_random_uuid(), '00000000-0000-0000-0000-0000000000d1', 1, auth.uid())$$,
  '42501', null, 'seller gets 42501, not BATCH_NOT_FOUND');

-- inactive user
select tests.logout();
select tests.login_as('picker') as inactive_id \gset
select tests.logout();
update public.profiles set active = false where id = :'inactive_id';
select tests.login_as_user(:'inactive_id');
select is(public.batch_remaining_g('00000000-0000-0000-0000-0000000000b3'), null,
  'inactive user gets no remaining value');
select throws_ok(
  $$insert into public.packings (id, batch_id, product_id, units, packed_by)
    values (gen_random_uuid(), '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000d1', 1, auth.uid())$$,
  '42501', null, 'inactive user cannot probe packing guard');
select throws_ok(
  $$insert into public.waste_records (id, batch_id, weight_g, reason, created_by)
    values (gen_random_uuid(), '00000000-0000-0000-0000-0000000000b3', 100000, 'annet', auth.uid())$$,
  '42501', null, 'inactive user cannot probe waste guard');

select * from finish();
rollback;
