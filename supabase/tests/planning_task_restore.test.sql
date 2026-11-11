begin;
create extension if not exists pgtap with schema extensions;
\ir helpers.psql
select no_plan();
select tests.login_as('picker') as picker_id \gset
select tests.login_as('seller') as seller_id \gset
select tests.login_as('owner') as owner_id \gset
insert into public.work_tasks(id, title, description, assigned_to, due_date, important, status)
values (gen_random_uuid(), 'Restore fixture', 'Keep description', :'picker_id', '2026-11-15', true, 'done') returning id as task_id \gset
select to_jsonb(t) - array['archived_at','archived_by','updated_at'] as original from public.work_tasks t where id = :'task_id' \gset
select public.archive_work_task(:'task_id');
select archived_at::text as archived_at from public.work_tasks where id = :'task_id' \gset
select throws_ok(format('update public.work_tasks set archived_at = null, archived_by = null, title = %L where id = %L', 'Changed', :'task_id'), 'P0001', 'TASK_ARCHIVED', 'owner cannot restore and edit');
select throws_ok(format('update public.work_tasks set archived_at = null where id = %L', :'task_id'), 'P0001', 'TASK_ARCHIVED', 'owner must clear both archive fields');
select throws_ok(format('update public.work_tasks set updated_at = now() where id = %L', :'task_id'), 'P0001', 'TASK_ARCHIVED', 'archived no-op is refused');
select tests.login_as_user(:'picker_id');
select is((select count(*) from public.work_tasks where id = :'task_id'), 0::bigint, 'archive hidden from assignee');
select throws_ok(format('select public.restore_work_task(%L)', :'task_id'), '42501', 'PLANNING_OWNER_REQUIRED', 'picker RPC refused');
with changed as (update public.work_tasks set archived_at = null, archived_by = null where id = :'task_id' returning *)
select is((select count(*) from changed), 0::bigint, 'picker direct restore refused by RLS');
select tests.login_as_user(:'seller_id');
select throws_ok(format('select public.restore_work_task(%L)', :'task_id'), '42501', 'PLANNING_OWNER_REQUIRED', 'seller RPC refused');
with changed as (update public.work_tasks set archived_at = null, archived_by = null where id = :'task_id' returning *)
select is((select count(*) from changed), 0::bigint, 'seller direct restore refused by RLS');
select tests.logout();
-- Defense in depth: the guard must refuse workers even with permissive RLS.
create policy test_restore_all on public.work_tasks for all to authenticated using (true) with check (true);
select tests.login_as_user(:'picker_id');
select throws_ok(format('update public.work_tasks set archived_at = null, archived_by = null where id = %L', :'task_id'), 'P0001', 'TASK_ARCHIVED', 'guard refuses picker restore');
select tests.login_as_user(:'seller_id');
select throws_ok(format('update public.work_tasks set archived_at = null, archived_by = null where id = %L', :'task_id'), 'P0001', 'TASK_ARCHIVED', 'guard refuses seller restore');
select tests.logout();
drop policy test_restore_all on public.work_tasks;
select tests.login_as_user(:'owner_id');
select lives_ok(format('select public.restore_work_task(%L)', :'task_id'), 'owner restores');
select ok((select archived_at is null and archived_by is null from public.work_tasks where id = :'task_id'), 'archive fields cleared');
select is((select (to_jsonb(t) - array['archived_at','archived_by','updated_at'])::text from public.work_tasks t where id = :'task_id'), :'original', 'restore preserves all business, completion and identity fields');
select is((select updated_at from public.work_tasks where id = :'task_id'), date_trunc('milliseconds',now()), 'restore sets DB update time');
select ok(exists(select from public.audit_log where row_id = :'task_id' and action = 'UPDATE'
  and (data->'old'->>'archived_at')::timestamptz = :'archived_at'::timestamptz and data->'new'->'archived_at' = 'null'::jsonb
  and data->'old'->>'archived_by' = :'owner_id' and data->'new'->'archived_by' = 'null'::jsonb
  and actor = :'owner_id'), 'restore audit retains old/new archive fields and actor');
select throws_ok(format('select public.restore_work_task(%L)', :'task_id'), 'P0001', 'PLANNING_NOT_FOUND', 'non-archived task refused');
select throws_ok($$select public.restore_work_task('00000000-0000-0000-0000-000000000099')$$, 'P0001', 'PLANNING_NOT_FOUND', 'unknown task refused');
select tests.login_as_user(:'picker_id');
select is((select count(*) from public.work_tasks where id = :'task_id'), 1::bigint, 'restored task visible to assignee');
select tests.login_as_user(:'owner_id');
select public.archive_work_task(:'task_id');
select lives_ok(format('update public.work_tasks set archived_at = null, archived_by = null, updated_at = %L where id = %L', '2000-01-01Z', :'task_id'), 'owner direct pure restore allowed');
select is((select updated_at from public.work_tasks where id = :'task_id'), date_trunc('milliseconds',now()), 'direct restore ignores forged update timestamp');
select tests.logout();
set local role anon;
select throws_ok($$select public.restore_work_task(gen_random_uuid())$$, '42501', null, 'anon cannot execute restore');
reset role;
select is((select prosecdef from pg_proc where oid = 'public.restore_work_task(uuid)'::regprocedure), false, 'restore security invoker');
select ok((select proconfig @> array['search_path=""'] from pg_proc where oid = 'public.restore_work_task(uuid)'::regprocedure), 'restore pins search path');
select ok(not has_function_privilege('anon', 'public.restore_work_task(uuid)', 'EXECUTE'), 'anon lacks execute');
select ok(has_function_privilege('authenticated', 'public.restore_work_task(uuid)', 'EXECUTE'), 'authenticated can call role-checked RPC');
select * from finish();
rollback;
