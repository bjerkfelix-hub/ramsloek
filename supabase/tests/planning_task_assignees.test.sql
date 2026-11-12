begin;
create extension if not exists pgtap with schema extensions;
\ir helpers.psql
select no_plan();
select tests.login_as('picker') as first_id \gset
select tests.login_as('seller') as second_id \gset
select tests.login_as('picker') as third_id \gset
select tests.login_as('picker') as inactive_id \gset
select tests.login_as('owner') as owner_id \gset
insert into public.work_tasks(id,title) values(gen_random_uuid(),'Backfill fixture') returning id as task_id \gset
-- Replay the real migration against the previous single-person storage shape.
-- Everything, including DDL and the migration replay, rolls back with this test.
select tests.logout();
alter table public.work_tasks add column assigned_to uuid references public.profiles(id);
select tests.login_as_user(:'owner_id');
update public.work_tasks set assigned_to = :'first_id' where id = :'task_id';
select updated_at::text as original_updated_at from public.work_tasks where id = :'task_id' \gset
select tests.logout();
drop table public.work_task_assignees cascade;
drop function public.is_work_task_assignee(uuid) cascade;
drop function public.set_work_task_assignees(uuid,uuid[]);
create index work_tasks_assigned_status_due on public.work_tasks(assigned_to,status,due_date) where archived_at is null;
create policy work_tasks_select on public.work_tasks for select to authenticated using (assigned_to = auth.uid() or public.app_role() = 'owner');
create policy work_tasks_update on public.work_tasks for update to authenticated using (assigned_to = auth.uid() or public.app_role() = 'owner');
-- The CLI mounts only tests. Replay its recorded statements in original order.
select unnest(statements) from supabase_migrations.schema_migrations where version = '20261112000017' \gexec
select tests.login_as_user(:'owner_id');
select ok(exists(select from public.work_task_assignees where task_id = :'task_id' and profile_id = :'first_id' and added_by = :'owner_id' and added_at = :'original_updated_at'::timestamptz), 'migration backfills the single assignee with original attribution and time');
select hasnt_column('public','work_tasks','assigned_to','single assignee column removed');
select public.set_work_task_assignees(:'task_id','{}');
select is((select count(*) from public.work_task_assignees where task_id = :'task_id'),0::bigint,'owner sets zero people');
select public.set_work_task_assignees(:'task_id',array[:'first_id'::uuid]);
select is((select count(*) from public.work_task_assignees where task_id = :'task_id'),1::bigint,'owner sets one person');
select public.set_work_task_assignees(:'task_id',array[:'first_id'::uuid,:'second_id'::uuid,:'third_id'::uuid,:'first_id'::uuid]);
select is((select count(*) from public.work_task_assignees where task_id = :'task_id'),3::bigint,'owner sets three people and deduplicates');
select count(*) as audit_count from public.audit_log where row_id = :'task_id' \gset
select public.set_work_task_assignees(:'task_id',array[:'third_id'::uuid,:'second_id'::uuid,:'first_id'::uuid]);
select is((select count(*) from public.audit_log where row_id = :'task_id'),:'audit_count'::bigint,'unchanged reordered set produces no audit or task update');
update public.profiles set active = false where id in (:'inactive_id',:'third_id');
select lives_ok(format('select public.set_work_task_assignees(%L,array[%L::uuid,%L::uuid,%L::uuid])',:'task_id',:'first_id',:'second_id',:'third_id'),'existing inactive assignee may stay');
select throws_ok(format('select public.set_work_task_assignees(%L,array[%L::uuid])',:'task_id',:'inactive_id'),'P0001','PLANNING_INACTIVE_PERSON','new inactive person refused');
select is((select count(*) from public.work_task_assignees where task_id = :'task_id'),3::bigint,'failed replacement keeps original set');
select throws_ok(format('select public.set_work_task_assignees(%L,array[null::uuid])',:'task_id'),'P0001','PLANNING_INACTIVE_PERSON','null person refused');
select throws_ok($$select public.set_work_task_assignees(gen_random_uuid(),'{}')$$,'P0001','PLANNING_NOT_FOUND','missing task refused');
select public.set_work_task_assignees(:'task_id',array[:'first_id'::uuid,:'second_id'::uuid]);
select tests.login_as_user(:'first_id');
select is((select count(*) from public.work_tasks where id = :'task_id'),1::bigint,'first assignee sees shared task');
select is((select count(*) from public.work_task_assignees where task_id = :'task_id'),2::bigint,'worker sees both memberships without recursive RLS');
select is((select count(*) from public.profiles where id = :'second_id'),1::bigint,'existing profile policy permits colleague names');
select throws_ok(format('select public.set_work_task_assignees(%L,''{}'')',:'task_id'),'42501','PLANNING_OWNER_REQUIRED','worker RPC refused');
select throws_ok(format('insert into public.work_task_assignees(task_id,profile_id) values(%L,%L)',:'task_id',:'third_id'),'42501',null,'worker direct insert refused');
select throws_ok($$delete from public.work_task_assignees$$,'42501',null,'worker direct delete refused');
select throws_ok($$update public.work_task_assignees set added_at = now()$$,'42501',null,'worker direct update refused');
update public.work_tasks set status = 'done' where id = :'task_id';
select tests.login_as_user(:'second_id');
select ok((select status = 'done' and completed_by = :'first_id' from public.work_tasks where id = :'task_id'),'second assignee sees one shared completion by first');
update public.work_tasks set status = 'done' where id = :'task_id';
select is((select completed_by from public.work_tasks where id = :'task_id'),:'first_id'::uuid,'repeated completion keeps first actor');
select tests.login_as_user(:'owner_id');
select public.set_work_task_assignees(:'task_id',array[:'second_id'::uuid]);
select ok(exists(select from public.audit_log where table_name = 'work_task_assignees' and row_id = :'task_id' and action = 'INSERT' and actor = :'owner_id' and data->'new'->>'profile_id' = :'second_id'), 'membership additions audited with actor and profile');
select ok(exists(select from public.audit_log where table_name = 'work_task_assignees' and row_id = :'task_id' and action = 'DELETE' and actor = :'owner_id' and data->'old'->>'profile_id' = :'first_id'), 'membership removals audited with actor and old profile');
select ok(exists(select from public.audit_log where table_name = 'work_tasks' and row_id = :'task_id' and action = 'UPDATE' and data->'old'->>'status' = 'done' and data->'new'->>'status' = 'done'), 'membership edit on done task updates task too');
select tests.login_as_user(:'first_id');
select is((select count(*) from public.work_tasks where id = :'task_id'),0::bigint,'removed assignee no longer sees task');
select is((select count(*) from public.work_task_assignees where task_id = :'task_id'),0::bigint,'removed assignee cannot see memberships');
with changed as (update public.work_tasks set status = 'done' where id = :'task_id' returning *) select is((select count(*) from changed),0::bigint,'removed assignee cannot update task');
select tests.login_as_user(:'owner_id');
update public.profiles set active = true where id = :'third_id';
select tests.login_as_user(:'third_id');
select is((select count(*) from public.work_tasks where id = :'task_id'),0::bigint,'active non-assignee cannot see shared task');
select tests.login_as_user(:'owner_id');
select public.archive_work_task(:'task_id');
select throws_ok(format('select public.set_work_task_assignees(%L,''{}'')',:'task_id'),'P0001','TASK_ARCHIVED','archived task refuses assignment changes');
select tests.login_as_user(:'second_id');
select is((select count(*) from public.work_task_assignees where task_id = :'task_id'),0::bigint,'archived memberships hidden from worker');
select tests.logout();
set local role anon;
select throws_ok($$select public.set_work_task_assignees(gen_random_uuid(),'{}')$$,'42501',null,'anon cannot execute RPC');
select throws_ok($$select * from public.work_task_assignees$$,'42501',null,'anon cannot read memberships');
reset role;
select ok(not has_table_privilege('authenticated','public.work_task_assignees','INSERT,UPDATE,DELETE'),'no authenticated direct writes');
select ok((select proconfig @> array['search_path=""'] from pg_proc where oid = 'public.set_work_task_assignees(uuid,uuid[])'::regprocedure),'RPC pins search path');
select * from finish();
rollback;
