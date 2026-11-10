begin;
create extension if not exists pgtap with schema extensions;
\ir helpers.psql

-- Keep inserts concise while exercising session permissions, RLS and all triggers.
create function tests.add_ledger_entry(p jsonb default '{}') returns uuid
language sql security invoker set search_path = '' as $$
  insert into public.ledger_entries (
    id, number, kind, entry_date, category_id, amount_ore, counterparty, description,
    payment_method, due_date, takings_id, created_by, created_at, client_key,
    voided_at, voided_by, void_reason, settled_at, settled_by
  ) values (
    coalesce((p->>'id')::uuid, gen_random_uuid()), p->>'number',
    coalesce(p->>'kind', 'expense'),
    coalesce((p->>'entry_date')::date, (now() at time zone 'Europe/Oslo')::date),
    (select id from public.ledger_categories where name = coalesce(p->>'category', 'Emballasje')),
    coalesce((p->>'amount_ore')::int, 12345), p->>'counterparty',
    coalesce(p->>'description', 'Ledger test'), coalesce(p->>'payment_method', 'card'),
    (p->>'due_date')::date, (p->>'takings_id')::uuid,
    coalesce((p->>'created_by')::uuid, auth.uid()),
    coalesce((p->>'created_at')::timestamptz, now()), (p->>'client_key')::uuid,
    (p->>'voided_at')::timestamptz, (p->>'voided_by')::uuid, p->>'void_reason',
    (p->>'settled_at')::timestamptz, (p->>'settled_by')::uuid
  ) returning id
$$;
revoke all on function tests.add_ledger_entry(jsonb) from public, anon, authenticated;
grant execute on function tests.add_ledger_entry(jsonb) to authenticated;
select plan(79);

select tests.login_as('owner') as owner_id \gset
select is((select count(*) from public.ledger_categories where kind = 'income'), 3::bigint, 'three seeded income categories');
select is((select count(*) from public.ledger_categories where kind = 'expense'), 9::bigint, 'nine seeded expense categories');
select is((select system_key || '/' || account_no from public.ledger_categories where name = 'Salg marked'),
  'market_sales/3000', 'market category has stable system key and account');

select tests.add_ledger_entry('{"entry_date":"2001-03-01","number":"spoofed"}') as first_id \gset
select matches((select number from public.ledger_entries where id = :'first_id'), '^R-\d{4}-\d{3,}$', 'owner expense gets generated number');
select is((select number from public.ledger_entries where id = :'first_id'), 'R-2001-001', 'number uses entry year and ignores supplied number');
select tests.add_ledger_entry('{"entry_date":"2001-04-01"}') as second_id \gset
select is((select split_part(number, '-', 3)::int from public.ledger_entries where id = :'second_id'),
  (select split_part(number, '-', 3)::int + 1 from public.ledger_entries where id = :'first_id'), 'sequential inserts have no gap');
-- Two historical years exercise the next-year reset without violating the future guard.
select tests.add_ledger_entry('{"entry_date":"2002-01-01"}') as next_year_id \gset
select is((select number from public.ledger_entries where id = :'next_year_id'), 'R-2002-001', 'next entry year starts a separate series');

select tests.login_as('seller') as seller_a \gset
select lives_ok($$select tests.add_ledger_entry('{"id":"00000000-0000-0000-0000-0000000000e1"}')$$, 'seller inserts own expense');
select is((select created_by from public.ledger_entries where id = '00000000-0000-0000-0000-0000000000e1'), :'seller_a'::uuid, 'seller creator is session user');
select throws_ok($$select tests.add_ledger_entry('{"created_by":"00000000-0000-0000-0000-0000000000ff"}')$$, '42501', null, 'seller cannot spoof creator');
select throws_ok($$select tests.add_ledger_entry('{"kind":"income","category":"Salg marked"}')$$, 'P0001', 'LEDGER_INCOME_VIA_TAKINGS', 'seller cannot insert income directly');
select throws_ok($$select tests.add_ledger_entry('{"takings_id":"00000000-0000-0000-0000-0000000000ff"}')$$, 'P0001', 'LEDGER_INCOME_VIA_TAKINGS', 'seller cannot forge takings link on expense');
select is((select count(*) from public.ledger_entries), 1::bigint, 'seller sees only own entry');
select tests.login_as('seller') as seller_b \gset
select is((select count(*) from public.ledger_entries where id = '00000000-0000-0000-0000-0000000000e1'), 0::bigint, 'other seller cannot read entry');
select tests.login_as('picker');
select throws_ok($$select tests.add_ledger_entry()$$, '42501', null, 'picker cannot insert');
select is((select count(*) from public.ledger_entries), 0::bigint, 'picker reads no entries');
select is((select count(*) from public.ledger_categories), 0::bigint, 'picker reads no categories');
select tests.logout();
set local role anon;
select throws_ok($$select * from public.ledger_entries$$, '42501', null, 'anon has no entry select grant');
select throws_ok($$select * from public.ledger_categories$$, '42501', null, 'anon has no category select grant');
reset role;

select tests.login_as_user(:'seller_a');
update public.ledger_entries set amount_ore = 999 where id = '00000000-0000-0000-0000-0000000000e1';
select is((select amount_ore from public.ledger_entries where id = '00000000-0000-0000-0000-0000000000e1'), 12345, 'seller update leaves own entry unchanged');
select tests.logout();
update public.ledger_entries set created_at = now() - interval '31 days' where id = '00000000-0000-0000-0000-0000000000e1';
select tests.login_as_user(:'seller_a');
select is((select count(*) from public.ledger_entries), 0::bigint, 'seller cannot read own entries older than 30 days');

select tests.login_as_user(:'owner_id');
select throws_ok($$select tests.add_ledger_entry(jsonb_build_object('entry_date', (now() at time zone 'Europe/Oslo')::date + 2))$$, 'P0001', 'LEDGER_FUTURE_DATE', 'two days ahead is refused');
select lives_ok($$select tests.add_ledger_entry(jsonb_build_object('entry_date', (now() at time zone 'Europe/Oslo')::date + 1))$$, 'one day ahead is allowed');
select throws_ok($$select tests.add_ledger_entry('{"category":"Salg marked"}')$$, 'P0001', 'LEDGER_CATEGORY_MISMATCH', 'category kind must match');
update public.ledger_categories set active = false where name = 'Annet';
select throws_ok($$select tests.add_ledger_entry('{"category":"Annet"}')$$, 'P0001', 'LEDGER_CATEGORY_INACTIVE', 'inactive category refused');
select throws_ok($$select tests.add_ledger_entry('{"payment_method":"unpaid"}')$$, '23514', null, 'unpaid requires due date');
select throws_ok($$select tests.add_ledger_entry('{"kind":"income","category":"Salg marked","payment_method":"private"}')$$, '23514', null, 'income cannot use private payment');
select throws_ok($$select tests.add_ledger_entry('{"amount_ore":0}')$$, '23514', null, 'zero amount refused');
select throws_ok($$select tests.add_ledger_entry('{"amount_ore":100000001}')$$, '23514', null, 'amount above limit refused');
select lives_ok($$select tests.add_ledger_entry('{"amount_ore":100000000}')$$, 'maximum amount is allowed');
select throws_ok($$select tests.add_ledger_entry('{"description":""}')$$, '23514', null, 'empty description refused');
select throws_ok($$select tests.add_ledger_entry(jsonb_build_object('description', repeat('x', 201)))$$, '23514', null, 'description above 200 characters refused');
select throws_ok($$select tests.add_ledger_entry('{"payment_method":"other"}')$$, '23514', null, 'unknown payment method refused');
select throws_ok($$select tests.add_ledger_entry('{"takings_id":"00000000-0000-0000-0000-0000000000ff"}')$$, 'P0001', 'LEDGER_INCOME_VIA_TAKINGS', 'owner cannot forge takings link either');

select lives_ok($$update public.ledger_entries set amount_ore = 15000 where id = '00000000-0000-0000-0000-0000000000e1'$$, 'owner may correct amount');
select is((select data->'old'->>'amount_ore' from public.audit_log where row_id = '00000000-0000-0000-0000-0000000000e1' and action = 'UPDATE' order by id desc limit 1), '12345', 'audit preserves old amount');
select is((select data->'new'->>'amount_ore' from public.audit_log where row_id = '00000000-0000-0000-0000-0000000000e1' and action = 'UPDATE' order by id desc limit 1), '15000', 'audit records new amount');
select is((select actor from public.audit_log where row_id = '00000000-0000-0000-0000-0000000000e1' and action = 'UPDATE' order by id desc limit 1), :'owner_id'::uuid, 'audit records session actor');
select is((select data->'new'->>'amount_ore' from public.audit_log where row_id = '00000000-0000-0000-0000-0000000000e1' and action = 'INSERT'), '12345', 'insert audit wraps row in new');
select throws_ok($$update public.ledger_entries set number = 'R-2000-999' where id = '00000000-0000-0000-0000-0000000000e1'$$, 'P0001', 'LEDGER_IMMUTABLE', 'number immutable');
select throws_ok($$update public.ledger_entries set created_by = auth.uid() where id = '00000000-0000-0000-0000-0000000000e1'$$, 'P0001', 'LEDGER_IMMUTABLE', 'creator immutable');
select throws_ok($$update public.ledger_entries set kind = 'income' where id = '00000000-0000-0000-0000-0000000000e1'$$, 'P0001', 'LEDGER_IMMUTABLE', 'kind immutable');
select throws_ok($$update public.ledger_entries set created_at = now() where id = '00000000-0000-0000-0000-0000000000e1'$$, 'P0001', 'LEDGER_IMMUTABLE', 'creation time immutable');
select throws_ok($$update public.ledger_entries set takings_id = gen_random_uuid() where id = '00000000-0000-0000-0000-0000000000e1'$$, 'P0001', 'LEDGER_IMMUTABLE', 'takings link immutable');
select throws_ok($$update public.ledger_entries set client_key = gen_random_uuid() where id = '00000000-0000-0000-0000-0000000000e1'$$, 'P0001', 'LEDGER_IMMUTABLE', 'idempotency key immutable');
select throws_ok($$update public.ledger_entries set entry_date = (now() at time zone 'Europe/Oslo')::date + 2 where id = '00000000-0000-0000-0000-0000000000e1'$$, 'P0001', 'LEDGER_FUTURE_DATE', 'future date rechecked on update');
select throws_ok($$update public.ledger_entries set category_id = (select id from public.ledger_categories where name = 'Salg marked') where id = '00000000-0000-0000-0000-0000000000e1'$$, 'P0001', 'LEDGER_CATEGORY_MISMATCH', 'category kind rechecked on update');
select throws_ok($$update public.ledger_entries set category_id = (select id from public.ledger_categories where name = 'Annet') where id = '00000000-0000-0000-0000-0000000000e1'$$, 'P0001', 'LEDGER_CATEGORY_INACTIVE', 'category active rechecked on update');
select throws_ok($$update public.ledger_entries set voided_at = now() where id = '00000000-0000-0000-0000-0000000000e1'$$, 'P0001', 'LEDGER_VOID_REASON', 'void requires reason');
select throws_ok($$update public.ledger_entries set voided_at = now(), void_reason = '  a  ' where id = '00000000-0000-0000-0000-0000000000e1'$$, 'P0001', 'LEDGER_VOID_REASON', 'void reason length excludes spaces');
select lives_ok($$update public.ledger_entries set voided_at = now(), void_reason = 'Feil beløp' where id = '00000000-0000-0000-0000-0000000000e1'$$, 'owner may void with reason');
select is((select voided_by from public.ledger_entries where id = '00000000-0000-0000-0000-0000000000e1'), :'owner_id'::uuid, 'void actor is owner');
select throws_ok($$update public.ledger_entries set amount_ore = 123 where id = '00000000-0000-0000-0000-0000000000e1'$$, 'P0001', 'LEDGER_VOIDED', 'voided entry cannot change');
select throws_ok($$update public.ledger_entries set voided_at = null where id = '00000000-0000-0000-0000-0000000000e1'$$, 'P0001', 'LEDGER_VOIDED', 'voided entry cannot be restored');

select tests.add_ledger_entry('{"id":"00000000-0000-0000-0000-0000000000e2"}');
select throws_ok($$update public.ledger_entries set settled_at = now() where id = '00000000-0000-0000-0000-0000000000e2'$$, 'P0001', 'LEDGER_SETTLE_INVALID', 'card entry cannot be settled');
select tests.add_ledger_entry('{"id":"00000000-0000-0000-0000-0000000000e3","payment_method":"private"}');
select lives_ok($$update public.ledger_entries set settled_at = now() where id = '00000000-0000-0000-0000-0000000000e3'$$, 'private entry may be settled');
select is((select settled_by from public.ledger_entries where id = '00000000-0000-0000-0000-0000000000e3'), :'owner_id'::uuid, 'settlement actor is owner');
select tests.add_ledger_entry('{"id":"00000000-0000-0000-0000-0000000000e4","payment_method":"unpaid","due_date":"2026-11-01"}');
select lives_ok($$update public.ledger_entries set settled_at = now() where id = '00000000-0000-0000-0000-0000000000e4'$$, 'unpaid entry may be settled');
select tests.add_ledger_entry('{"client_key":"00000000-0000-0000-0000-0000000000cc"}');
select throws_ok($$select tests.add_ledger_entry('{"client_key":"00000000-0000-0000-0000-0000000000cc"}')$$, '23505', null, 'duplicate idempotency key refused');
select ok(not has_table_privilege('authenticated', 'public.ledger_entries', 'DELETE'), 'authenticated has no entry delete grant');
select throws_ok($$delete from public.ledger_entries$$, '42501', null, 'owner delete denied by grants');
select tests.logout();
select throws_ok($$delete from public.ledger_entries$$, 'P0001', 'LEDGER_NO_DELETE', 'postgres cannot delete entries');
-- Verify the owner also reaches the blocker if a delete grant/policy were added later.
grant delete on public.ledger_entries to authenticated;
create policy test_entry_delete on public.ledger_entries for delete to authenticated using (true);
select tests.login_as_user(:'owner_id');
select throws_ok($$delete from public.ledger_entries$$, 'P0001', 'LEDGER_NO_DELETE', 'owner delete blocked even with test-only grant');

select lives_ok($$insert into public.ledger_categories (kind, name, account_no) values ('expense', 'Test category', '6550')$$, 'owner adds category');
select lives_ok($$update public.ledger_categories set name = 'Renamed category', account_no = '6540', sort = 100 where name = 'Test category'$$, 'owner renames and reorders category');
select is((select data->'old'->>'name' from public.audit_log where table_name = 'ledger_categories' and data->'new'->>'name' = 'Renamed category' order by id desc limit 1), 'Test category', 'category audit preserves old name');
select throws_ok($$update public.ledger_categories set kind = 'income' where name = 'Renamed category'$$, 'P0001', 'LEDGER_IMMUTABLE', 'category kind immutable');
select throws_ok($$update public.ledger_categories set system_key = 'forged' where name = 'Renamed category'$$, 'P0001', 'LEDGER_IMMUTABLE', 'system key immutable');
select throws_ok($$insert into public.ledger_categories (kind, name, account_no) values ('expense', 'emballasje', '4300')$$, '23505', null, 'category names unique ignoring case per kind');
select throws_ok($$insert into public.ledger_categories (kind, name, account_no) values ('expense', 'Bad account', '123')$$, '23514', null, 'account must be four digits');
select ok(not has_table_privilege('authenticated', 'public.ledger_categories', 'DELETE'), 'authenticated has no category delete grant');
select throws_ok($$delete from public.ledger_categories$$, '42501', null, 'owner category delete denied by grants');
select tests.logout();
select throws_ok($$delete from public.ledger_categories$$, 'P0001', 'LEDGER_NO_DELETE', 'postgres cannot delete categories');
grant delete on public.ledger_categories to authenticated;
create policy test_category_delete on public.ledger_categories for delete to authenticated using (true);
select tests.login_as_user(:'owner_id');
select throws_ok($$delete from public.ledger_categories$$, 'P0001', 'LEDGER_NO_DELETE', 'owner category delete blocked with test-only grant');
select tests.login_as_user(:'seller_a');
select throws_ok($$insert into public.ledger_categories (kind, name, account_no) values ('expense', 'Seller category', '6550')$$, '42501', null, 'seller cannot add categories');
select is((select count(*) from public.ledger_categories where not active), 0::bigint, 'seller sees no inactive categories');
select is((select count(*) from public.ledger_categories), 12::bigint, 'seller sees all active categories');
update public.ledger_categories set name = 'Seller rename' where name = 'Emballasje';
select is((select count(*) from public.ledger_categories where name = 'Emballasje'), 1::bigint, 'seller cannot rename category');

-- Four-digit padding must never truncate a sequence above 999.
select tests.logout();
insert into public.number_series (series, year, last) values ('ledger', 2003, 999);
select tests.login_as_user(:'owner_id');
select tests.add_ledger_entry('{"id":"00000000-0000-0000-0000-0000000000e5","entry_date":"2003-01-01"}');
select is((select number from public.ledger_entries where id = '00000000-0000-0000-0000-0000000000e5'), 'R-2003-1000', 'numbers beyond 999 are not truncated');
select * from finish();
rollback;
