begin;
create extension if not exists pgtap with schema extensions;
\ir helpers.psql
select plan(5);

create function tests.add_receipt(p_key text, p_mime text) returns void language sql as $$
  insert into public.ledger_receipts (entry_id, storage_key, file_name, mime_type, size_bytes, sha256)
  values ('00000000-0000-0000-0000-0000000000f1', p_key, 'r', p_mime, 10, repeat('a', 64))
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

select * from finish();
rollback;
