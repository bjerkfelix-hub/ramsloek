begin;
create extension if not exists pgtap with schema extensions;
\ir helpers.psql
select no_plan();

insert into public.products(name, net_weight_g, unit_kind, shelf_life_days, active) values
 ('Test public consumer', 111, 'consumer', 5, true), ('Test hidden consumer', 222, 'consumer', 5, false), ('Test hidden trade', 333, 'trade', 5, true);
set local role service_role;
select lives_ok($$insert into public.consumer_interests(name,email,bags,language,consent_text) values ('Ola','shop-test@example.test',2,'no','Samtykke')$$, 'server insert path works');
select lives_ok($$insert into public.business_inquiries(company,contact_name,email,type,message,language,consent_text) values ('Kjøkkenet','Ola','shop-test@example.test','restaurant','Hei','en','Consent')$$, 'server inquiry insert works');
select lives_ok($$insert into public.consumer_interests(name,email,bags,language,consent_text) values ('Ola oppdatert','shop-test@example.test',5,'en','Consent') on conflict(email) do update set name=excluded.name, bags=excluded.bags, language=excluded.language, consent_text=excluded.consent_text$$, 'duplicate email uses atomic upsert');
select is((select count(*) from public.consumer_interests where email='shop-test@example.test'),1::bigint,'one row per email');
select is((select bags from public.consumer_interests where email='shop-test@example.test'),5,'duplicate email updates bags');
select throws_ok($$update public.consumer_interests set bags=0$$,'23514',null,'bags lower bound');
select throws_ok($$update public.consumer_interests set bags=51$$,'23514',null,'bags upper bound');
select throws_ok($$update public.consumer_interests set name=repeat('a',101)$$,'23514',null,'name length');
select throws_ok($$update public.consumer_interests set name=' '$$,'23514',null,'name required');
select throws_ok($$update public.consumer_interests set comment=repeat('a',1001)$$,'23514',null,'comment length');
select throws_ok($$update public.consumer_interests set email='INVALID'$$,'23514',null,'email format');
select throws_ok($$update public.consumer_interests set phone='letters'$$,'23514',null,'loose phone validation');
select throws_ok($$update public.consumer_interests set language='xx'$$,'23514',null,'language validation');
select throws_ok($$update public.consumer_interests set consent_text=''$$,'23514',null,'consent is recorded');
select throws_ok($$update public.business_inquiries set company=''$$,'23514',null,'company required');
select throws_ok($$update public.business_inquiries set contact_name=repeat('a',101)$$,'23514',null,'contact name length');
select throws_ok($$update public.business_inquiries set message=''$$,'23514',null,'message required');
select throws_ok($$update public.business_inquiries set message=repeat('a',2001)$$,'23514',null,'message length');
select throws_ok($$update public.business_inquiries set weekly_quantity=repeat('a',101)$$,'23514',null,'weekly quantity length');
select throws_ok($$update public.business_inquiries set type='invalid'$$,'23514',null,'business type');
select throws_ok($$update public.business_inquiries set answered_at=now()$$,'23514',null,'answered timestamp requires actor');
reset role;
select tests.logout();
set local role anon;
select throws_ok($$select * from public.consumer_interests$$,'42501',null,'anon cannot read interests');
select throws_ok($$select * from public.business_inquiries$$,'42501',null,'anon cannot read inquiries');
select throws_ok($$insert into public.consumer_interests(name,email,bags,language,consent_text) values ('Ola','anon@example.test',2,'no','Consent')$$,'42501',null,'anon must use server action, not direct inserts');
select throws_ok($$insert into public.business_inquiries(company,contact_name,email,type,message,language,consent_text) values ('K','O','anon@example.test','restaurant','Hei','no','Consent')$$,'42501',null,'anon cannot directly insert inquiry');
select ok(exists(select from public.public_consumer_products() where name='Test public consumer'),'anon sees active consumer product');
select ok(not exists(select from public.public_consumer_products() where name in ('Test hidden consumer','Test hidden trade')),'inactive and trade products stay private');
select throws_ok($$select gtin from public.public_consumer_products()$$,'42703',null,'function exposes no private product columns');
select throws_ok($$select public.purge_public_contacts_system()$$,'42501',null,'anon cannot purge');
reset role;
select tests.login_as('picker');
select is((select count(*) from public.consumer_interests),0::bigint,'picker cannot read interests');
select is((select count(*) from public.business_inquiries),0::bigint,'picker cannot read inquiries');
with changed as (update public.business_inquiries set answered_at=now(),answered_by=auth.uid() returning id) select is((select count(*) from changed),0::bigint,'picker cannot update');
with changed as (delete from public.consumer_interests returning id) select is((select count(*) from changed),0::bigint,'picker cannot delete');
reset role;
select tests.login_as('seller');
select is((select count(*) from public.consumer_interests),0::bigint,'seller cannot read interests');
select is((select count(*) from public.business_inquiries),0::bigint,'seller cannot read inquiries');
with changed as (delete from public.business_inquiries returning id) select is((select count(*) from changed),0::bigint,'seller cannot delete');
reset role;
select tests.login_as('owner') as owner_id \gset
select is((select count(*) from public.consumer_interests where email='shop-test@example.test'),1::bigint,'owner lists interest');
select is((select count(*) from public.business_inquiries where email='shop-test@example.test'),1::bigint,'owner lists inquiry');
select lives_ok($$update public.business_inquiries set answered_at=now(), answered_by=auth.uid() where email='shop-test@example.test'$$,'owner answers inquiry');
select is((select answered_by from public.business_inquiries where email='shop-test@example.test'),:'owner_id'::uuid,'answer attribution');
select lives_ok($$update public.business_inquiries set answered_at=null, answered_by=null where email='shop-test@example.test'$$,'owner undoes answer');
select lives_ok($$update public.consumer_interests set bags=7 where email='shop-test@example.test'$$,'owner updates interest');
select lives_ok($$delete from public.consumer_interests where email='shop-test@example.test'$$,'owner deletes interest');
select lives_ok($$delete from public.business_inquiries where email='shop-test@example.test'$$,'owner deletes inquiry');
select is((select count(*) from public.business_inquiries where email='shop-test@example.test'),0::bigint,'deleted inquiry gone');
select ok(exists(select from public.audit_log where table_name='business_inquiries' and action='DELETE' and actor=auth.uid()),'delete is audited');
select is((select count(distinct action) from public.audit_log where table_name='business_inquiries'),3::bigint,'insert, update and delete are audited');
select ok(not exists(select from public.audit_log where table_name in ('consumer_interests','business_inquiries') and data::text like '%shop-test@example.test%'),'audit does not retain personal data');
select throws_ok($$select public.purge_public_contacts_system()$$,'42501',null,'owner cannot call system purge');
reset role;
insert into public.business_inquiries(company,contact_name,email,type,message,language,consent_text,created_at) values
 ('Old','Ola','old@example.test','annet','Hei','no','Consent',now()-interval '13 months'),
 ('Recent','Ola','recent@example.test','annet','Hei','no','Consent',now()-interval '11 months');
insert into public.consumer_interests(name,email,bags,language,consent_text,consented_at) values
 ('Old','old-interest@example.test',1,'no','Consent',make_date(extract(year from now())::int-1,1,1)),
 ('Current','current-interest@example.test',1,'no','Consent',now());
select public.purge_public_contacts_system();
select is((select count(*) from public.consumer_interests where email='old-interest@example.test'),0::bigint,'purge removes interest from previous seasons');
select is((select count(*) from public.consumer_interests where email='current-interest@example.test'),1::bigint,'purge keeps current season interest');
select is((select count(*) from public.business_inquiries where email='old@example.test'),0::bigint,'purge removes old inquiries');
select is((select count(*) from public.business_inquiries where email='recent@example.test'),1::bigint,'purge keeps recent inquiries');
select ok(exists(select from cron.job where jobname='purge-public-contacts'),'retention job scheduled');
select * from finish();
rollback;
