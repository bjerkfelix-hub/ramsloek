begin;
create extension if not exists pgtap with schema extensions;
\ir helpers.psql
select plan(11);

-- fixtures (as service_role)
set local role service_role;
insert into public.season_signups (email, language, consent_text) values
  ('a@example.test', 'no', 'samtykke'),
  ('b@example.test', 'en', 'consent');
reset role;

-- owner reads every row through RLS
select tests.login_as('owner') as owner_id \gset
select is((select count(*) from public.season_signups where email like '%@example.test'), 2::bigint, 'owner sees season_signups rows');

-- picker and seller see nothing
reset role;
select tests.login_as('picker') as picker_id \gset
select is((select count(*) from public.season_signups), 0::bigint, 'picker select returns 0 rows');
reset role;
select tests.login_as('seller') as seller_id \gset
select is((select count(*) from public.season_signups), 0::bigint, 'seller select returns 0 rows');

-- authenticated (even owner) cannot write
reset role;
select tests.login_as_user(:'owner_id'::uuid);
select throws_ok($$insert into public.season_signups (email, language, consent_text) values ('c@example.test', 'no', 'x')$$,
  '42501', null, 'authenticated cannot insert season_signups');
select throws_ok($$update public.season_signups set language = 'en'$$, '42501', null, 'authenticated cannot update season_signups');
select throws_ok($$delete from public.season_signups$$, '42501', null, 'authenticated cannot delete season_signups');

-- anon has no access at all
select tests.logout();
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$select 1 from public.season_signups$$, '42501', null, 'anon cannot select season_signups');
reset role;

-- handle_new_user: role comes from app_metadata only
insert into auth.users (id, aud, role, email, raw_user_meta_data)
values ('00000000-0000-0000-0000-0000000000b1', 'authenticated', 'authenticated',
        'lur@example.test', '{"role":"owner","full_name":"Lur"}');
select is((select role::text from public.profiles where id = '00000000-0000-0000-0000-0000000000b1'),
  'picker', 'user_metadata role owner without app_metadata role gets picker');

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values ('00000000-0000-0000-0000-0000000000b2', 'authenticated', 'authenticated',
        'selg@example.test', '{"provider":"email","role":"seller"}', '{"full_name":"Selg"}');
select is((select role::text from public.profiles where id = '00000000-0000-0000-0000-0000000000b2'),
  'seller', 'app_metadata role seller gives seller');
select is((select full_name from public.profiles where id = '00000000-0000-0000-0000-0000000000b2'),
  'Selg', 'full_name still comes from user_metadata');

insert into auth.users (id, aud, role, email)
values ('00000000-0000-0000-0000-0000000000b3', 'authenticated', 'authenticated', 'tom@example.test');
select is((select full_name || '/' || role from public.profiles where id = '00000000-0000-0000-0000-0000000000b3'),
  'tom@example.test/picker', 'no metadata: full_name falls back to e-mail, role to picker');

select * from finish();
rollback;
