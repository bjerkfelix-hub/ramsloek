begin;
create extension if not exists pgtap with schema extensions;
\ir helpers.psql

-- Helpers run as the session user, exercising grants, RLS and triggers.
create function tests.add_takings(p jsonb default '{}') returns uuid
language sql security invoker set search_path = '' as $$
  insert into public.market_takings (id, market_day_id, vipps_ore, card_ore, cash_ore, note, created_by, created_at,
    voided_at, voided_by, void_reason)
  values (coalesce((p->>'id')::uuid, gen_random_uuid()),
    coalesce((p->>'market_day_id')::uuid, '00000000-0000-0000-0000-00000000d001'::uuid),
    coalesce((p->>'vipps_ore')::int, 435000), coalesce((p->>'card_ore')::int, 210000),
    coalesce((p->>'cash_ore')::int, 0), p->>'note', coalesce((p->>'created_by')::uuid, auth.uid()),
    coalesce((p->>'created_at')::timestamptz, now()), (p->>'voided_at')::timestamptz,
    (p->>'voided_by')::uuid, p->>'void_reason') returning id
$$;
create function tests.add_receipt(p jsonb default '{}') returns uuid
language sql security invoker set search_path = '' as $$
  insert into public.ledger_receipts (id, entry_id, takings_id, storage_key, file_name, mime_type, size_bytes, sha256,
    uploaded_by, uploaded_at)
  values (coalesce((p->>'id')::uuid, gen_random_uuid()), (p->>'entry_id')::uuid, (p->>'takings_id')::uuid,
    coalesce(p->>'storage_key', 'receipts/2004/' || gen_random_uuid() || '.jpg'), 'receipt.jpg',
    coalesce(p->>'mime_type', 'image/jpeg'), coalesce((p->>'size_bytes')::int, 100), repeat('a', 64),
    coalesce((p->>'uploaded_by')::uuid, auth.uid()), coalesce((p->>'uploaded_at')::timestamptz, now())) returning id
$$;
create function tests.add_report_entry(p jsonb default '{}') returns uuid
language sql security invoker set search_path = '' as $$
  insert into public.ledger_entries (id, kind, entry_date, category_id, amount_ore, description, payment_method)
  values (coalesce((p->>'id')::uuid, gen_random_uuid()), coalesce(p->>'kind', 'expense'),
    coalesce((p->>'entry_date')::date, '2004-03-15'::date),
    (select id from public.ledger_categories where name = coalesce(p->>'category', 'Emballasje')),
    coalesce((p->>'amount_ore')::int, 10000), 'Takings test', 'card') returning id
$$;
revoke all on function tests.add_takings(jsonb), tests.add_receipt(jsonb), tests.add_report_entry(jsonb) from public, anon, authenticated;
grant execute on function tests.add_takings(jsonb), tests.add_receipt(jsonb), tests.add_report_entry(jsonb) to authenticated;
select plan(107);

select tests.login_as('owner') as owner_id \gset
select tests.login_as('seller') as seller_a \gset
select tests.login_as('seller') as seller_b \gset
select tests.login_as('picker') as picker_id \gset
select tests.logout();
insert into public.market_days (id, market_date, starts_at, ends_at, place_name, address, cancelled) values
  ('00000000-0000-0000-0000-00000000d001', '2004-03-15', '10:00', '15:00', 'Test market', 'Test address', false),
  ('00000000-0000-0000-0000-00000000d002', '2004-03-15', '10:00', '15:00', 'Cancelled market', 'Test address', true),
  ('00000000-0000-0000-0000-00000000d003', (now() at time zone 'Europe/Oslo')::date + 1, '10:00', '15:00', 'Future market', 'Test address', false),
  ('00000000-0000-0000-0000-00000000d004', '2004-03-16', '10:00', '15:00', 'Cash market', 'Test address', false);

select tests.login_as_user(:'seller_a');
select lives_ok($$select tests.add_takings('{"id":"00000000-0000-0000-0000-00000000a001","created_at":"2000-01-01","voided_at":"2000-01-01","voided_by":"00000000-0000-0000-0000-00000000ffff","void_reason":"spoofed"}')$$, 'seller inserts takings on a past market day');
select is((select count(*) from public.ledger_entries where takings_id = '00000000-0000-0000-0000-00000000a001'), 2::bigint, 'only the two nonzero amounts create entries');
select results_eq($$select e.kind, c.system_key, e.entry_date, e.amount_ore, e.payment_method, e.created_by, e.description
  from public.ledger_entries e join public.ledger_categories c on c.id = e.category_id
  where e.takings_id = '00000000-0000-0000-0000-00000000a001' order by e.payment_method$$,
  $$values ('income'::text, 'market_sales'::text, '2004-03-15'::date, 210000, 'card'::text, auth.uid(), 'Dagsoppgjør Test market 15.03.2004'::text),
    ('income'::text, 'market_sales'::text, '2004-03-15'::date, 435000, 'vipps'::text, auth.uid(), 'Dagsoppgjør Test market 15.03.2004'::text)$$,
  'generated entries have exact amounts, methods, dates, category, creator and description');
select ok((select created_at = now() and voided_at is null and voided_by is null and void_reason is null
  from public.market_takings where id = '00000000-0000-0000-0000-00000000a001'), 'insert cannot forge creation or void metadata');
select throws_ok($$select tests.add_takings('{"vipps_ore":0,"card_ore":0}')$$, 'P0001', 'TAKINGS_EMPTY', 'empty takings have mapped error');
select throws_ok($$select tests.add_takings('{"market_day_id":"00000000-0000-0000-0000-00000000d003"}')$$, 'P0001', 'TAKINGS_FUTURE_DAY', 'future market day refused');
select throws_ok($$select tests.add_takings('{"market_day_id":"00000000-0000-0000-0000-00000000d002"}')$$, 'P0001', 'TAKINGS_CANCELLED_DAY', 'cancelled market day refused');
select throws_ok($$select tests.add_takings()$$, '23505', null, 'only one active takings per market day');
select throws_ok($$select tests.add_takings('{"created_by":"00000000-0000-0000-0000-00000000ffff"}')$$, '42501', null, 'seller cannot spoof takings creator');
select throws_ok($$select tests.add_takings('{"market_day_id":"00000000-0000-0000-0000-00000000ffff"}')$$, '23503', null, 'missing market day refused');
select throws_ok($$select tests.add_takings('{"market_day_id":"00000000-0000-0000-0000-00000000d004","vipps_ore":-1}')$$, '23514', null, 'negative vipps refused');
select throws_ok($$select tests.add_takings('{"market_day_id":"00000000-0000-0000-0000-00000000d004","card_ore":-1}')$$, '23514', null, 'negative card refused');
select throws_ok($$select tests.add_takings('{"market_day_id":"00000000-0000-0000-0000-00000000d004","cash_ore":-1}')$$, '23514', null, 'negative cash refused');
select throws_ok($$select tests.add_takings('{"market_day_id":"00000000-0000-0000-0000-00000000d004","vipps_ore":100000001}')$$, '23514', null, 'vipps above maximum refused');
select throws_ok($$select tests.add_takings('{"market_day_id":"00000000-0000-0000-0000-00000000d004","card_ore":100000001}')$$, '23514', null, 'card above maximum refused');
select throws_ok($$select tests.add_takings('{"market_day_id":"00000000-0000-0000-0000-00000000d004","cash_ore":100000001}')$$, '23514', null, 'cash above maximum refused');
update public.market_takings set vipps_ore = 1 where id = '00000000-0000-0000-0000-00000000a001';
select is((select vipps_ore from public.market_takings where id = '00000000-0000-0000-0000-00000000a001'), 435000, 'seller cannot update own takings');
select tests.add_report_entry('{"id":"00000000-0000-0000-0000-00000000e001"}');
select lives_ok($$select tests.add_receipt('{"id":"00000000-0000-0000-0000-00000000b001","entry_id":"00000000-0000-0000-0000-00000000e001","uploaded_at":"2000-01-01"}')$$, 'seller attaches receipt to own entry');
select ok((select uploaded_by = auth.uid() and uploaded_at = now() from public.ledger_receipts where id = '00000000-0000-0000-0000-00000000b001'), 'receipt uploader and upload time are session metadata');
select lives_ok($$select tests.add_receipt('{"id":"00000000-0000-0000-0000-00000000b002","takings_id":"00000000-0000-0000-0000-00000000a001"}')$$, 'seller attaches report to own takings');
select throws_ok($$select tests.add_receipt('{"entry_id":"00000000-0000-0000-0000-00000000e001","takings_id":"00000000-0000-0000-0000-00000000a001"}')$$, '23514', null, 'receipt cannot have both parents');
select throws_ok($$select tests.add_receipt()$$, '23514', null, 'receipt must have a parent');
select throws_ok($$select tests.add_receipt('{"entry_id":"00000000-0000-0000-0000-00000000ffff"}')$$, 'P0001', 'RECEIPT_PARENT_INVALID', 'unknown seller parent refused');
select throws_ok($$select tests.add_receipt('{"entry_id":"00000000-0000-0000-0000-00000000e001","uploaded_by":"00000000-0000-0000-0000-00000000ffff"}')$$, '42501', null, 'receipt uploader cannot be spoofed');
select throws_ok($$select tests.add_receipt('{"entry_id":"00000000-0000-0000-0000-00000000e001","mime_type":"text/html"}')$$, '23514', null, 'unsupported receipt mime refused');
select throws_ok($$select tests.add_receipt('{"entry_id":"00000000-0000-0000-0000-00000000e001","size_bytes":0}')$$, '23514', null, 'empty file refused');
select throws_ok($$select tests.add_receipt('{"entry_id":"00000000-0000-0000-0000-00000000e001","size_bytes":10485761}')$$, '23514', null, 'receipt above 10 MB refused');
select throws_ok($$update public.ledger_receipts set file_name = 'changed'$$, '42501', null, 'seller has no receipt update grant');

select tests.login_as_user(:'seller_b');
select is((select count(*) from public.market_takings), 0::bigint, 'other seller sees no takings');
select is((select count(*) from public.ledger_receipts), 0::bigint, 'other seller sees no receipts');
select throws_ok($$select tests.add_receipt('{"entry_id":"00000000-0000-0000-0000-00000000e001"}')$$, 'P0001', 'RECEIPT_PARENT_INVALID', 'seller cannot attach to another seller entry');
select throws_ok($$select tests.add_receipt('{"takings_id":"00000000-0000-0000-0000-00000000a001"}')$$, 'P0001', 'RECEIPT_PARENT_INVALID', 'seller cannot attach to another seller takings');
select throws_ok($$select * from public.ledger_totals('2004-03-01', '2004-03-31')$$, '42501', null, 'seller cannot call totals');
select throws_ok($$select * from public.ledger_by_category('2004-03-01', '2004-03-31')$$, '42501', null, 'seller cannot call category report');
select throws_ok($$select * from public.ledger_by_month('2004-03-01', '2004-03-31')$$, '42501', null, 'seller cannot call monthly report');
select throws_ok($$select * from public.mva_meter()$$, '42501', null, 'seller cannot call MVA meter');

select tests.login_as_user(:'picker_id');
select throws_ok($$select tests.add_takings()$$, '42501', null, 'picker cannot insert takings');
select throws_ok($$select tests.add_receipt('{"entry_id":"00000000-0000-0000-0000-00000000e001"}')$$, '42501', null, 'picker cannot insert receipts');
select is((select count(*) from public.market_takings), 0::bigint, 'picker sees no takings');
select is((select count(*) from public.ledger_receipts), 0::bigint, 'picker sees no receipts');
select throws_ok($$select * from public.ledger_totals('2004-03-01', '2004-03-31')$$, '42501', null, 'picker cannot call totals');
select throws_ok($$select * from public.ledger_by_category('2004-03-01', '2004-03-31')$$, '42501', null, 'picker cannot call category report');
select throws_ok($$select * from public.ledger_by_month('2004-03-01', '2004-03-31')$$, '42501', null, 'picker cannot call monthly report');
select throws_ok($$select * from public.mva_meter()$$, '42501', null, 'picker cannot call MVA meter');
select tests.logout();
set local role anon;
select throws_ok($$select * from public.market_takings$$, '42501', null, 'anon has no takings read grant');
select throws_ok($$select * from public.ledger_receipts$$, '42501', null, 'anon has no receipt read grant');
select throws_ok($$select * from public.ledger_totals('2004-03-01', '2004-03-31')$$, '42501', null, 'anon cannot call totals');
select throws_ok($$select * from public.ledger_by_category('2004-03-01', '2004-03-31')$$, '42501', null, 'anon cannot call category report');
select throws_ok($$select * from public.ledger_by_month('2004-03-01', '2004-03-31')$$, '42501', null, 'anon cannot call monthly report');
select throws_ok($$select * from public.mva_meter()$$, '42501', null, 'anon cannot call MVA meter');
reset role;

select tests.login_as_user(:'owner_id');
select is((select count(*) from public.ledger_receipts), 2::bigint, 'owner sees all receipts');
select is((select count(*) from public.market_takings), 1::bigint, 'owner sees all takings');
select throws_ok($$update public.market_takings set vipps_ore = 1$$, 'P0001', 'LEDGER_IMMUTABLE', 'owner cannot change vipps');
select throws_ok($$update public.market_takings set card_ore = 1$$, 'P0001', 'LEDGER_IMMUTABLE', 'owner cannot change card');
select throws_ok($$update public.market_takings set cash_ore = 1$$, 'P0001', 'LEDGER_IMMUTABLE', 'owner cannot change cash');
select throws_ok($$update public.market_takings set market_day_id = '00000000-0000-0000-0000-00000000d004'$$, 'P0001', 'LEDGER_IMMUTABLE', 'owner cannot change market day');
select throws_ok($$update public.market_takings set note = 'changed'$$, 'P0001', 'LEDGER_IMMUTABLE', 'owner cannot change note');
select throws_ok($$update public.market_takings set created_by = auth.uid()$$, 'P0001', 'LEDGER_IMMUTABLE', 'owner cannot change creator');
select throws_ok($$update public.market_takings set created_at = now() - interval '1 day'$$, 'P0001', 'LEDGER_IMMUTABLE', 'owner cannot change creation time');
select throws_ok($$update public.market_takings set id = gen_random_uuid()$$, 'P0001', 'LEDGER_IMMUTABLE', 'owner cannot change takings id');
select throws_ok($$update public.market_takings set voided_by = auth.uid()$$, 'P0001', 'LEDGER_IMMUTABLE', 'owner cannot change void actor directly');
select throws_ok($$update public.market_takings set voided_at = now()$$, 'P0001', 'LEDGER_VOID_REASON', 'takings void needs a reason');
select throws_ok($$update public.market_takings set voided_at = now(), void_reason = ' a '$$, 'P0001', 'LEDGER_VOID_REASON', 'takings reason excludes whitespace');
select lives_ok($$update public.market_takings set voided_at = now(), void_reason = 'Feil dag' where id = '00000000-0000-0000-0000-00000000a001'$$, 'owner voids takings');
select is((select count(*) from public.ledger_entries where takings_id = '00000000-0000-0000-0000-00000000a001' and voided_at = now() and void_reason = 'Feil dag' and voided_by = auth.uid()), 2::bigint, 'void cascades to both entries with reason and actor');
select is((select voided_by from public.market_takings where id = '00000000-0000-0000-0000-00000000a001'), :'owner_id'::uuid, 'takings void actor set');
select throws_ok($$update public.market_takings set voided_at = null where id = '00000000-0000-0000-0000-00000000a001'$$, 'P0001', 'LEDGER_VOIDED', 'voided takings cannot be restored');
select throws_ok($$update public.market_takings set note = 'changed' where id = '00000000-0000-0000-0000-00000000a001'$$, 'P0001', 'LEDGER_VOIDED', 'voided takings cannot be edited');
select is((select data->'old'->>'vipps_ore' from public.audit_log where table_name = 'market_takings' and action = 'UPDATE' order by id desc limit 1), '435000', 'takings audit stores old values');
select is((select data->'new'->>'void_reason' from public.audit_log where table_name = 'market_takings' and action = 'UPDATE' order by id desc limit 1), 'Feil dag', 'takings audit stores new values');
select is((select data->'new'->>'file_name' from public.audit_log where row_id = '00000000-0000-0000-0000-00000000b001'), 'receipt.jpg', 'receipt insert audited');

select tests.login_as_user(:'seller_a');
select throws_ok($$select tests.add_receipt('{"takings_id":"00000000-0000-0000-0000-00000000a001"}')$$, 'P0001', 'RECEIPT_PARENT_INVALID', 'seller cannot attach to voided takings');
select throws_ok($$insert into public.ledger_receipts (entry_id, storage_key, file_name, mime_type, size_bytes, sha256) select id, 'receipts/2004/' || gen_random_uuid() || '.jpg', 'receipt.jpg', 'image/jpeg', 100, repeat('a',64) from public.ledger_entries where takings_id = '00000000-0000-0000-0000-00000000a001' limit 1$$, 'P0001', 'RECEIPT_PARENT_INVALID', 'seller cannot attach to voided entry');
select lives_ok($$select tests.add_takings('{"id":"00000000-0000-0000-0000-00000000a002"}')$$, 'new takings allowed after void');
select tests.login_as_user(:'owner_id');
select throws_ok($$update public.ledger_entries set amount_ore = 1 where takings_id = '00000000-0000-0000-0000-00000000a002'$$, 'P0001', 'LEDGER_IMMUTABLE', 'owner cannot edit a takings entry amount');
select lives_ok($$update public.ledger_entries set voided_at = now(), void_reason = 'Feil post' where takings_id = '00000000-0000-0000-0000-00000000a002' and payment_method = 'card'$$, 'owner can directly void a takings entry');
select lives_ok($$update public.market_takings set voided_at = now(), void_reason = 'Feil oppgjør' where id = '00000000-0000-0000-0000-00000000a002'$$, 'takings void skips already voided children');
select is((select void_reason from public.ledger_entries where takings_id = '00000000-0000-0000-0000-00000000a002' and payment_method = 'card'), 'Feil post', 'already voided entry retains its reason');
select tests.login_as_user(:'seller_a');
select tests.add_takings('{"id":"00000000-0000-0000-0000-00000000a003"}');
select lives_ok($$select tests.add_takings('{"id":"00000000-0000-0000-0000-00000000a004","market_day_id":"00000000-0000-0000-0000-00000000d004","vipps_ore":0,"card_ore":0,"cash_ore":100}')$$, 'cash-only takings accepted');
select is((select amount_ore from public.ledger_entries where takings_id = '00000000-0000-0000-0000-00000000a004' and payment_method = 'cash'), 100, 'cash creates matching entry');
select tests.add_receipt('{"id":"00000000-0000-0000-0000-00000000b003","takings_id":"00000000-0000-0000-0000-00000000a003"}');

-- Age parents as trusted maintenance; receipt visibility follows the parent, not upload time.
select tests.logout();
update public.ledger_entries set created_at = now() - interval '31 days' where id = '00000000-0000-0000-0000-00000000e001';
update public.market_takings set created_at = now() - interval '31 days' where id = '00000000-0000-0000-0000-00000000a003';
select tests.login_as_user(:'seller_a');
select is((select count(*) from public.market_takings where id = '00000000-0000-0000-0000-00000000a003'), 0::bigint, 'seller cannot read old takings');
select is((select count(*) from public.ledger_receipts where id in ('00000000-0000-0000-0000-00000000b001','00000000-0000-0000-0000-00000000b003')), 0::bigint, 'seller cannot read receipts of old entry or takings');
select throws_ok($$select tests.add_receipt('{"entry_id":"00000000-0000-0000-0000-00000000e001"}')$$, 'P0001', 'RECEIPT_PARENT_INVALID', 'seller cannot attach to old entry');
select throws_ok($$select tests.add_receipt('{"takings_id":"00000000-0000-0000-0000-00000000a003"}')$$, 'P0001', 'RECEIPT_PARENT_INVALID', 'seller cannot attach to old takings');
select tests.login_as_user(:'owner_id');
select is((select count(*) from public.ledger_receipts), 3::bigint, 'owner still sees old receipts');
select lives_ok($$select tests.add_receipt('{"entry_id":"00000000-0000-0000-0000-00000000e001"}')$$, 'owner can attach to another user old entry');
select throws_ok($$update public.ledger_receipts set file_name = 'changed'$$, '42501', null, 'owner has no receipt update grant');
select ok(not has_table_privilege('authenticated', 'public.market_takings', 'DELETE'), 'no takings delete grant');
select ok(not has_table_privilege('authenticated', 'public.ledger_receipts', 'DELETE'), 'no receipt delete grant');
select throws_ok($$delete from public.market_takings$$, '42501', null, 'owner cannot delete takings');
select throws_ok($$delete from public.ledger_receipts$$, '42501', null, 'owner cannot delete receipts');
select tests.logout();
select throws_ok($$update public.ledger_receipts set file_name = 'changed'$$, '42501', null, 'receipt update trigger blocks trusted maintenance too');
select throws_ok($$delete from public.market_takings$$, 'P0001', 'LEDGER_NO_DELETE', 'postgres cannot delete takings');
select throws_ok($$delete from public.ledger_receipts$$, 'P0001', 'LEDGER_NO_DELETE', 'postgres cannot delete receipts');
grant delete on public.market_takings, public.ledger_receipts to authenticated;
create policy test_takings_delete on public.market_takings for delete to authenticated using (true);
create policy test_receipts_delete on public.ledger_receipts for delete to authenticated using (true);
select tests.login_as_user(:'owner_id');
select throws_ok($$delete from public.market_takings$$, 'P0001', 'LEDGER_NO_DELETE', 'owner hits takings delete blocker with test-only grant');
select throws_ok($$delete from public.ledger_receipts$$, 'P0001', 'LEDGER_NO_DELETE', 'owner hits receipts delete blocker with test-only grant');

-- Historic report period is isolated from the rolling MVA fixtures.
select tests.add_report_entry('{"kind":"income","category":"Annen inntekt","amount_ore":1000}');
select tests.add_report_entry('{"entry_date":"2004-04-01","amount_ore":20000}');
select results_eq($$select * from public.ledger_totals('2004-03-01','2004-03-31')$$,
  $$values (646100::bigint, 10000::bigint, 636100::bigint)$$, 'totals include only active entries within inclusive period');
select results_eq($$select * from public.ledger_totals('2004-03-15','2004-03-15')$$,
  $$values (646000::bigint, 10000::bigint, 636000::bigint)$$, 'period endpoints are inclusive');
select results_eq($$select * from public.ledger_totals('2000-01-01','2000-01-31')$$,
  $$values (0::bigint, 0::bigint, 0::bigint)$$, 'empty totals return zero');
select results_eq($$select * from public.ledger_by_category('2004-03-01','2004-03-31') order by kind, account_no$$,
  $$values ('expense'::text, 'Emballasje'::text, '4300'::text, 10000::bigint),
    ('income'::text, 'Salg marked'::text, '3000'::text, 645100::bigint),
    ('income'::text, 'Annen inntekt'::text, '3900'::text, 1000::bigint)$$, 'category report carries accounts and excludes voided entries');
select results_eq($$select * from public.ledger_by_month('2004-03-01','2004-04-30') order by month$$,
  $$values ('2004-03-01'::date, 646100::bigint, 10000::bigint, 636100::bigint),
    ('2004-04-01'::date, 0::bigint, 20000::bigint, -20000::bigint)$$, 'monthly report buckets by entry date');
select is((select count(*) from public.ledger_by_category('2000-01-01','2000-01-31')), 0::bigint, 'empty category report has no rows');
select is((select count(*) from public.ledger_by_month('2000-01-01','2000-01-31')), 0::bigint, 'empty monthly report has no rows');

select tests.add_report_entry(jsonb_build_object('kind','income','category','Annen inntekt','amount_ore',111,
  'entry_date', ((now() at time zone 'Europe/Oslo')::date - interval '12 months')::date));
select tests.add_report_entry(jsonb_build_object('kind','income','category','Annen inntekt','amount_ore',222,
  'entry_date', ((now() at time zone 'Europe/Oslo')::date - interval '12 months')::date + 1));
select tests.add_report_entry(jsonb_build_object('kind','income','category','Annen inntekt','amount_ore',333,
  'entry_date', (now() at time zone 'Europe/Oslo')::date));
select tests.add_report_entry(jsonb_build_object('kind','income','category','Annen inntekt','amount_ore',444,
  'entry_date', (now() at time zone 'Europe/Oslo')::date + 1));
select tests.add_report_entry(jsonb_build_object('id','00000000-0000-0000-0000-00000000e003',
  'kind','income','category','Annen inntekt','amount_ore',666,'entry_date',(now() at time zone 'Europe/Oslo')::date));
update public.ledger_entries set voided_at = now(), void_reason = 'Test void' where id = '00000000-0000-0000-0000-00000000e003';
select tests.add_report_entry(jsonb_build_object('amount_ore',777,'entry_date',(now() at time zone 'Europe/Oslo')::date));
select results_eq($$select * from public.mva_meter()$$,
  $$values (555::bigint, 5000000::bigint, ((now() at time zone 'Europe/Oslo')::date - interval '12 months')::date)$$,
  'MVA meter uses exclusive 12-month boundary, includes today, excludes expenses, future and voided income');

select tests.logout();
select ok((select not public and file_size_limit = 10485760 and allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','application/pdf']
  from storage.buckets where id = 'receipts' and name = 'receipts'), 'private receipts bucket has exact size and MIME restrictions');
select is((select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects'), 0::bigint, 'no storage object policies expose receipts');
-- Trigger functions must not be callable directly by API roles.
select ok(not has_function_privilege('authenticated','public.market_takings_guard()','EXECUTE')
  and not has_function_privilege('authenticated','public.market_takings_to_entries()','EXECUTE')
  and not has_function_privilege('authenticated','public.market_takings_void_entries()','EXECUTE')
  and not has_function_privilege('authenticated','public.ledger_receipts_guard()','EXECUTE'), 'trigger functions have no authenticated execute grants');
select * from finish();
rollback;
