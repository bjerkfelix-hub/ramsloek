begin;
create extension if not exists pgtap with schema extensions;
\ir helpers.psql
select plan(9);

create function tests.add_receipt(p_key text, p_mime text) returns void language sql as $$
  insert into public.ledger_receipts (entry_id, storage_key, file_name, mime_type, size_bytes, sha256)
  values ('00000000-0000-0000-0000-0000000000f1', tests.receipt_object(p_key, p_mime, 10), 'r', p_mime, 10, repeat('a', 64))
$$;
grant execute on function tests.add_receipt(text, text) to authenticated;

select tests.login_as('seller') as seller_id \gset
insert into public.ledger_entries (id, kind, entry_date, category_id, amount_ore, description, payment_method)
select '00000000-0000-0000-0000-0000000000f1', 'expense', (now() at time zone 'Europe/Oslo')::date, id, 1000, 'Key test', 'card'
from public.ledger_categories where name = 'Emballasje';


select lives_ok($$select tests.add_receipt('receipts/2027/' || gen_random_uuid() || '.jpg', 'image/jpeg')$$, 'server-shaped key accepted');
select throws_ok($$select tests.add_receipt('receipts/2027/../../other/' || gen_random_uuid() || '.jpg', 'image/jpeg')$$, '23514', null, 'path traversal refused');
select throws_ok($$select tests.add_receipt('someone-else/secret.pdf', 'application/pdf')$$, '23514', null, 'foreign path refused');
select throws_ok($$select tests.add_receipt('receipts/2027/' || gen_random_uuid() || '.pdf', 'image/jpeg')$$, '23514', null, 'extension must match type');
select throws_ok($$select tests.add_receipt('receipts/2027/' || upper(gen_random_uuid()::text) || '.jpg', 'image/jpeg')$$, '23514', null, 'only lower-case uuid keys');

select throws_ok($$insert into public.ledger_receipts(entry_id, storage_key, file_name, mime_type, size_bytes, sha256)
values ('00000000-0000-0000-0000-0000000000f1', 'receipts/2027/00000000-0000-0000-0000-000000000001.jpg', 'missing', 'image/jpeg', 1, 'hash')$$,
'23514', 'RECEIPT_OBJECT_MISSING', 'seller cannot register missing bytes');
select tests.receipt_object('receipts/2027/00000000-0000-0000-0000-000000000001.jpg', 'image/jpeg', 123);
select lives_ok($$insert into public.ledger_receipts(entry_id, storage_key, file_name, mime_type, size_bytes, sha256)
values ('00000000-0000-0000-0000-0000000000f1', 'receipts/2027/00000000-0000-0000-0000-000000000001.jpg', 'real', 'application/pdf', 999, 'server-hash')$$, 'stored bytes permit insert');
select results_eq($$select size_bytes, mime_type, sha256 from public.ledger_receipts where file_name = 'real'$$,
$$values (123, 'image/jpeg'::text, 'server-hash'::text)$$, 'object controls size and MIME; hash is preserved');
select throws_ok($$select tests.add_receipt('receipts/2027/00000000-0000-0000-0000-000000000001.jpg', 'image/jpeg')$$, '23505', null, 'duplicate key rejected');
select * from finish();
rollback;
