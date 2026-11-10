begin;
create extension if not exists pgtap with schema extensions;
\ir helpers.psql
select plan(11);

-- number series
select is(public.next_number('lot', 2027), 1, 'next_number: first call for a series/year returns 1');
select is(public.next_number('lot', 2027), 2, 'next_number: second call returns 2');
select is(public.next_number('lot', 2028), 1, 'next_number: a new year restarts at 1');

-- auth.users trigger creates profile
insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values ('00000000-0000-0000-0000-0000000000aa', 'authenticated', 'authenticated',
        'kari@example.test', '{"role":"seller"}', '{"full_name":"Kari"}');
select is(
  (select role::text from public.profiles where id = '00000000-0000-0000-0000-0000000000aa'),
  'seller', 'auth.users insert creates a profile with the app_metadata role');

-- picker
select tests.login_as('picker') as picker_id \gset
select is(public.app_role()::text, 'picker', 'app_role() returns the caller''s role');
with u as (update public.settings set company_name = 'X' returning 1)
select is((select count(*) from u), 0::bigint, 'picker cannot update settings (0 rows affected)');
select is((select count(*) from public.audit_log), 0::bigint, 'picker sees no audit_log rows');
select throws_ok('select * from public.number_series', '42501', null,
  'number_series is not directly readable');
select tests.logout();

-- owner
select tests.login_as('owner') as owner_id \gset
with u as (update public.settings set company_name = 'Ramsløk AS' returning 1)
select is((select count(*) from u), 1::bigint, 'owner can update settings');
select is(
  (select count(*) from public.audit_log
    where table_name = 'settings' and action = 'UPDATE' and actor = :'owner_id'::uuid),
  1::bigint, 'settings update writes one audit_log UPDATE row with the owner as actor');
select tests.logout();

-- inactive profile
update public.profiles set active = false where id = :'picker_id'::uuid;
select tests.login_as_user(:'picker_id'::uuid);
select is(public.app_role()::text, null, 'inactive profile has no app_role()');

select * from finish();
rollback;
