begin;
create extension if not exists pgtap with schema extensions;
\ir helpers.psql
select plan(6);
select tests.login_as('picker') as picker_id \gset
select ok((select count(*) from public.profiles) > 0, 'active picker reads profiles');
select is((select count(*) from public.settings), 1::bigint, 'active picker reads settings');
select tests.logout();
update public.profiles set active = false where id = :'picker_id';
select tests.login_as_user(:'picker_id');
select is(public.app_role()::text, null::text, 'inactive profile has no app role');
select is((select count(*) from public.profiles), 0::bigint, 'inactive session reads zero profiles');
select is((select count(*) from public.settings), 0::bigint, 'inactive session reads zero settings');
select tests.logout();
update public.profiles set active = true where id = :'picker_id';
select tests.login_as_user(:'picker_id');
select is(public.app_role()::text, 'picker', 'reactivated profile regains its role');
select * from finish();
rollback;
