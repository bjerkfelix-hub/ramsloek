begin;
create extension if not exists pgtap with schema extensions;
\ir helpers.psql
select no_plan();
select has_table('public', 'work_tasks', 'task board storage exists');
create function tests.task(p_person uuid default null, p_status text default 'todo', p_extra jsonb default '{}')
returns uuid language plpgsql as $$
declare v_id uuid;
begin
  insert into public.work_tasks(id, title, description, due_date, important, status,
    created_by, created_at, updated_at, completed_at, completed_by, archived_at, archived_by)
  select coalesce(t.id, gen_random_uuid()), coalesce(t.title, 'Fixture task'), t.description,
    t.due_date, coalesce(t.important, false), t.status,
    coalesce(t.created_by, auth.uid()), t.created_at, t.updated_at,
    t.completed_at, t.completed_by, t.archived_at, t.archived_by
  from jsonb_populate_record(null::public.work_tasks,
    jsonb_build_object('status', p_status) || p_extra) t returning id into v_id;
  if p_person is not null then perform public.set_work_task_assignees(v_id, array[p_person]); end if;
  return v_id;
end $$;
grant execute on function tests.task(uuid,text,jsonb) to authenticated;
select tests.login_as('picker') as picker_a \gset
select tests.login_as('picker') as picker_b \gset
select tests.login_as('seller') as seller_a \gset
select tests.login_as('seller') as seller_b \gset
select tests.login_as('picker') as inactive \gset
select tests.login_as('owner') as owner_id \gset
update public.profiles set active = false where id = :'inactive';
select tests.task() as unassigned \gset
select tests.task(:'owner_id') as owner_task \gset
select tests.task() as managed \gset
select is((select created_by from public.work_tasks where id = :'managed'), :'owner_id'::uuid, 'owner creator is caller');
select is((select created_at from public.work_tasks where id = :'managed'), date_trunc('milliseconds', now()), 'creation uses DB time');
select throws_ok(format('select tests.task(%L)', :'inactive'), 'P0001', 'PLANNING_INACTIVE_PERSON', 'inactive assignment denied');
select throws_ok($$select tests.task(null, 'todo', '{"title":"   "}')$$, '23514', null, 'blank trimmed title rejected');
select throws_ok(format('select tests.task(null, %L, %L)', 'todo', jsonb_build_object('title',repeat('x',201))), '23514', null, 'title over 200 rejected');
select throws_ok(format('select tests.task(null, %L, %L)', 'todo', jsonb_build_object('description',repeat('x',10001))), '23514', null, 'description over 10000 rejected');
select throws_ok($$select tests.task(null, 'unknown')$$, '23514', null, 'unknown status rejected');
select throws_ok(format('select tests.task(null, %L, %L)', 'todo', jsonb_build_object('created_by', :'picker_a')), '42501', null, 'owner cannot forge creator');
select throws_ok(format('select tests.task(null, %L, %L)', 'todo', jsonb_build_object('archived_at', now(), 'archived_by', :'picker_a')), 'P0001', 'TASK_ARCHIVED', 'new tasks cannot start archived');
select lives_ok(format('select tests.task(null, %L, %L)', 'todo', jsonb_build_object('title',repeat('x',200),'description',repeat('x',10000))), 'maximum title and description accepted');
select tests.task(null, 'todo', jsonb_build_object('completed_at', now(), 'completed_by', :'picker_a')) as forged_todo \gset
select ok((select completed_at is null and completed_by is null from public.work_tasks where id = :'forged_todo'), 'todo ignores forged completion pair');
select tests.task(null, 'done', jsonb_build_object('completed_at','2000-01-01Z','completed_by', :'picker_a', 'created_at','2000-01-01Z','updated_at','2000-01-01Z')) as inserted_done \gset
select is((select completed_by from public.work_tasks where id = :'inserted_done'), :'owner_id'::uuid, 'insert done actor is owner');
select is((select completed_at from public.work_tasks where id = :'inserted_done'), date_trunc('milliseconds',now()), 'insert done time is DB time');
select is((select created_at = updated_at and created_at = completed_at from public.work_tasks where id = :'inserted_done'), true, 'insert timestamps cannot be spoofed');
select public.set_work_task_assignees(:'managed', array[:'picker_a'::uuid]);
select is((select profile_id from public.work_task_assignees where task_id = :'managed'), :'picker_a'::uuid, 'owner assigns picker_a');
select public.set_work_task_assignees(:'managed', array[:'picker_b'::uuid]);
select is((select profile_id from public.work_task_assignees where task_id = :'managed'), :'picker_b'::uuid, 'owner assigns picker_b');
select public.set_work_task_assignees(:'managed', array[:'seller_a'::uuid]);
select is((select profile_id from public.work_task_assignees where task_id = :'managed'), :'seller_a'::uuid, 'owner assigns seller_a');
select public.set_work_task_assignees(:'managed', array[:'seller_b'::uuid]);
select is((select profile_id from public.work_task_assignees where task_id = :'managed'), :'seller_b'::uuid, 'owner assigns seller_b');
select public.set_work_task_assignees(:'managed', array[:'owner_id'::uuid]);
select is((select profile_id from public.work_task_assignees where task_id = :'managed'), :'owner_id'::uuid, 'owner assigns owner_id');
update public.work_tasks set title = ' Edited task ', description = 'Description', due_date = '2026-11-10', important = true, status = 'in_progress' where id = :'managed';
select public.set_work_task_assignees(:'managed', '{}');
select is((select title from public.work_tasks where id = :'managed'), 'Edited task', 'owner title trimmed');
select ok((select description = 'Description' and due_date = '2026-11-10' and important and status = 'in_progress' and not exists(select from public.work_task_assignees where task_id = :'managed') from public.work_tasks where id = :'managed'), 'owner manages all business fields and clears assignee');
update public.work_tasks set status = 'done', completed_by = :'picker_a', completed_at = '2000-01-01Z' where id = :'managed';
select is((select completed_by from public.work_tasks where id = :'managed'), :'owner_id'::uuid, 'owner completion stamps owner rather than assignee');
update public.work_tasks set status = 'todo' where id = :'managed';
select ok((select completed_by is null and completed_at is null from public.work_tasks where id = :'managed'), 'owner reopen clears completion pair');
select is((select data->'old'->>'completed_by' from public.audit_log where row_id = :'managed' and data->'old'->>'status' = 'done'), :'owner_id', 'reopen history preserves completion actor');
select is((select (data->'old'->>'completed_at')::timestamptz from public.audit_log where row_id = :'managed' and data->'old'->>'status' = 'done'), date_trunc('milliseconds',now()), 'reopen history preserves completion time');
select tests.task(:'picker_a') as picker_a_todo \gset
select tests.task(:'picker_a', 'in_progress') as picker_a_progress \gset
select tests.task(:'picker_b') as picker_b_todo \gset
select tests.task(:'picker_b', 'in_progress') as picker_b_progress \gset
select tests.task(:'seller_a') as seller_a_todo \gset
select tests.task(:'seller_a', 'in_progress') as seller_a_progress \gset
select tests.task(:'seller_b') as seller_b_todo \gset
select tests.task(:'seller_b', 'in_progress') as seller_b_progress \gset

select tests.login_as_user(:'picker_a');
select is((select count(*) from public.work_tasks), 2::bigint, 'picker_a reads assigned only');
select is((select count(*) from public.work_tasks where not public.is_work_task_assignee(id)), 0::bigint, 'picker_a cannot see peers or unassigned');
select is((select count(*) from public.profiles p join public.work_task_assignees a on a.profile_id = p.id join public.work_tasks t on t.id = a.task_id where p.id <> auth.uid()), 0::bigint, 'picker_a joins cannot leak peer tasks');
select is((select count(*) from public.audit_log), 0::bigint, 'picker_a cannot read audit');
select throws_ok($$select tests.task(auth.uid())$$, '42501', null, 'picker_a insert denied');
select throws_ok($$select public.archive_work_task(gen_random_uuid())$$, '42501', null, 'picker_a archive denied before lookup');
select row_to_json(t)::text as before_mutations from public.work_tasks t where id = :'picker_a_todo' \gset
select throws_ok(format('update public.work_tasks set title = ''Forged'' where id = %L', :'picker_a_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'picker_a cannot edit title');
select throws_ok(format('update public.work_tasks set title = ''Forged'', status = ''done'' where id = %L', :'picker_a_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'picker_a cannot edit title with done');
select throws_ok(format('update public.work_tasks set description = ''Forged'' where id = %L', :'picker_a_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'picker_a cannot edit description');
select throws_ok(format('update public.work_tasks set description = ''Forged'', status = ''done'' where id = %L', :'picker_a_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'picker_a cannot edit description with done');
select throws_ok(format('update public.work_tasks set due_date = ''2026-01-01'' where id = %L', :'picker_a_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'picker_a cannot edit due_date');
select throws_ok(format('update public.work_tasks set due_date = ''2026-01-01'', status = ''done'' where id = %L', :'picker_a_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'picker_a cannot edit due_date with done');
select throws_ok(format('update public.work_tasks set important = true where id = %L', :'picker_a_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'picker_a cannot edit important');
select throws_ok(format('update public.work_tasks set important = true, status = ''done'' where id = %L', :'picker_a_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'picker_a cannot edit important with done');
select throws_ok(format('update public.work_tasks set created_by = %L where id = %L', :'picker_a', :'picker_a_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'picker_a cannot edit created_by');
select throws_ok(format('update public.work_tasks set created_by = %L, status = ''done'' where id = %L', :'picker_a', :'picker_a_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'picker_a cannot edit created_by with done');
select throws_ok(format('update public.work_tasks set created_at = ''2000-01-01Z'' where id = %L', :'picker_a_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'picker_a cannot edit created_at');
select throws_ok(format('update public.work_tasks set created_at = ''2000-01-01Z'', status = ''done'' where id = %L', :'picker_a_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'picker_a cannot edit created_at with done');
select throws_ok(format('update public.work_tasks set id = gen_random_uuid() where id = %L', :'picker_a_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'picker_a cannot edit id');
select throws_ok(format('update public.work_tasks set id = gen_random_uuid(), status = ''done'' where id = %L', :'picker_a_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'picker_a cannot edit id with done');
select throws_ok(format('update public.work_tasks set archived_at = now() where id = %L', :'picker_a_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'picker_a cannot edit archived_at');
select throws_ok(format('update public.work_tasks set archived_at = now(), status = ''done'' where id = %L', :'picker_a_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'picker_a cannot edit archived_at with done');
select throws_ok(format('update public.work_tasks set archived_by = %L where id = %L', :'owner_id', :'picker_a_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'picker_a cannot edit archived_by');
select throws_ok(format('update public.work_tasks set archived_by = %L, status = ''done'' where id = %L', :'owner_id', :'picker_a_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'picker_a cannot edit archived_by with done');
select throws_ok(format('update public.work_tasks set status = %L where id = %L', 'in_progress', :'picker_a_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'picker_a cannot start progress');
select is((select status from public.work_tasks where id = :'picker_a_todo'), 'todo', 'picker_a rejected writes leave status unchanged');
select is((select row_to_json(t)::text from public.work_tasks t where id = :'picker_a_todo'), :'before_mutations', 'picker_a forbidden edits leave entire row unchanged');
update public.work_tasks set status = 'done', completed_by = :'seller_a', completed_at = '2000-01-01Z', updated_at = '2000-01-01Z' where id = :'picker_a_todo';
select is((select completed_by from public.work_tasks where id = :'picker_a_todo'), :'picker_a'::uuid, 'picker_a done actor is caller');
select ok((select completed_at = date_trunc('milliseconds',now()) and updated_at = completed_at from public.work_tasks where id = :'picker_a_todo'), 'picker_a done timestamps are DB time');
update public.work_tasks set status = 'done' where id = :'picker_a_progress';
select is((select status from public.work_tasks where id = :'picker_a_progress'), 'done', 'picker_a progress to done allowed');
select row_to_json(t)::text as before_row from public.work_tasks t where id = :'picker_a_todo' \gset
update public.work_tasks set status = 'done', completed_at = '2000-01-01Z', completed_by = :'owner_id', updated_at = '2000-01-01Z' where id = :'picker_a_todo';
select is((select row_to_json(t)::text from public.work_tasks t where id = :'picker_a_todo'), :'before_row', 'picker_a repeated done preserves all metadata');
select throws_ok(format('update public.work_tasks set status = %L where id = %L', 'todo', :'picker_a_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'picker_a cannot reopen');
with changed as (update public.work_tasks set status = 'done' where id = :'owner_task' returning *) select is((select count(*) from changed), 0::bigint, 'picker_a guessed id changes zero rows');

select tests.login_as_user(:'picker_b');
select is((select count(*) from public.work_tasks), 2::bigint, 'picker_b reads assigned only');
select is((select count(*) from public.work_tasks where not public.is_work_task_assignee(id)), 0::bigint, 'picker_b cannot see peers or unassigned');
select is((select count(*) from public.profiles p join public.work_task_assignees a on a.profile_id = p.id join public.work_tasks t on t.id = a.task_id where p.id <> auth.uid()), 0::bigint, 'picker_b joins cannot leak peer tasks');
select is((select count(*) from public.audit_log), 0::bigint, 'picker_b cannot read audit');
select throws_ok($$select tests.task(auth.uid())$$, '42501', null, 'picker_b insert denied');
select throws_ok($$select public.archive_work_task(gen_random_uuid())$$, '42501', null, 'picker_b archive denied before lookup');
select row_to_json(t)::text as before_mutations from public.work_tasks t where id = :'picker_b_todo' \gset
select throws_ok(format('update public.work_tasks set title = ''Forged'' where id = %L', :'picker_b_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'picker_b cannot edit title');
select throws_ok(format('update public.work_tasks set title = ''Forged'', status = ''done'' where id = %L', :'picker_b_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'picker_b cannot edit title with done');
select throws_ok(format('update public.work_tasks set description = ''Forged'' where id = %L', :'picker_b_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'picker_b cannot edit description');
select throws_ok(format('update public.work_tasks set description = ''Forged'', status = ''done'' where id = %L', :'picker_b_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'picker_b cannot edit description with done');
select throws_ok(format('update public.work_tasks set due_date = ''2026-01-01'' where id = %L', :'picker_b_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'picker_b cannot edit due_date');
select throws_ok(format('update public.work_tasks set due_date = ''2026-01-01'', status = ''done'' where id = %L', :'picker_b_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'picker_b cannot edit due_date with done');
select throws_ok(format('update public.work_tasks set important = true where id = %L', :'picker_b_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'picker_b cannot edit important');
select throws_ok(format('update public.work_tasks set important = true, status = ''done'' where id = %L', :'picker_b_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'picker_b cannot edit important with done');
select throws_ok(format('update public.work_tasks set created_by = %L where id = %L', :'picker_b', :'picker_b_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'picker_b cannot edit created_by');
select throws_ok(format('update public.work_tasks set created_by = %L, status = ''done'' where id = %L', :'picker_b', :'picker_b_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'picker_b cannot edit created_by with done');
select throws_ok(format('update public.work_tasks set created_at = ''2000-01-01Z'' where id = %L', :'picker_b_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'picker_b cannot edit created_at');
select throws_ok(format('update public.work_tasks set created_at = ''2000-01-01Z'', status = ''done'' where id = %L', :'picker_b_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'picker_b cannot edit created_at with done');
select throws_ok(format('update public.work_tasks set id = gen_random_uuid() where id = %L', :'picker_b_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'picker_b cannot edit id');
select throws_ok(format('update public.work_tasks set id = gen_random_uuid(), status = ''done'' where id = %L', :'picker_b_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'picker_b cannot edit id with done');
select throws_ok(format('update public.work_tasks set archived_at = now() where id = %L', :'picker_b_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'picker_b cannot edit archived_at');
select throws_ok(format('update public.work_tasks set archived_at = now(), status = ''done'' where id = %L', :'picker_b_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'picker_b cannot edit archived_at with done');
select throws_ok(format('update public.work_tasks set archived_by = %L where id = %L', :'owner_id', :'picker_b_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'picker_b cannot edit archived_by');
select throws_ok(format('update public.work_tasks set archived_by = %L, status = ''done'' where id = %L', :'owner_id', :'picker_b_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'picker_b cannot edit archived_by with done');
select throws_ok(format('update public.work_tasks set status = %L where id = %L', 'in_progress', :'picker_b_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'picker_b cannot start progress');
select is((select status from public.work_tasks where id = :'picker_b_todo'), 'todo', 'picker_b rejected writes leave status unchanged');
select is((select row_to_json(t)::text from public.work_tasks t where id = :'picker_b_todo'), :'before_mutations', 'picker_b forbidden edits leave entire row unchanged');
update public.work_tasks set status = 'done', completed_by = :'seller_a', completed_at = '2000-01-01Z', updated_at = '2000-01-01Z' where id = :'picker_b_todo';
select is((select completed_by from public.work_tasks where id = :'picker_b_todo'), :'picker_b'::uuid, 'picker_b done actor is caller');
select ok((select completed_at = date_trunc('milliseconds',now()) and updated_at = completed_at from public.work_tasks where id = :'picker_b_todo'), 'picker_b done timestamps are DB time');
update public.work_tasks set status = 'done' where id = :'picker_b_progress';
select is((select status from public.work_tasks where id = :'picker_b_progress'), 'done', 'picker_b progress to done allowed');
select row_to_json(t)::text as before_row from public.work_tasks t where id = :'picker_b_todo' \gset
update public.work_tasks set status = 'done', completed_at = '2000-01-01Z', completed_by = :'owner_id', updated_at = '2000-01-01Z' where id = :'picker_b_todo';
select is((select row_to_json(t)::text from public.work_tasks t where id = :'picker_b_todo'), :'before_row', 'picker_b repeated done preserves all metadata');
select throws_ok(format('update public.work_tasks set status = %L where id = %L', 'todo', :'picker_b_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'picker_b cannot reopen');
with changed as (update public.work_tasks set status = 'done' where id = :'owner_task' returning *) select is((select count(*) from changed), 0::bigint, 'picker_b guessed id changes zero rows');

select tests.login_as_user(:'seller_a');
select is((select count(*) from public.work_tasks), 2::bigint, 'seller_a reads assigned only');
select is((select count(*) from public.work_tasks where not public.is_work_task_assignee(id)), 0::bigint, 'seller_a cannot see peers or unassigned');
select is((select count(*) from public.profiles p join public.work_task_assignees a on a.profile_id = p.id join public.work_tasks t on t.id = a.task_id where p.id <> auth.uid()), 0::bigint, 'seller_a joins cannot leak peer tasks');
select is((select count(*) from public.audit_log), 0::bigint, 'seller_a cannot read audit');
select throws_ok($$select tests.task(auth.uid())$$, '42501', null, 'seller_a insert denied');
select throws_ok($$select public.archive_work_task(gen_random_uuid())$$, '42501', null, 'seller_a archive denied before lookup');
select row_to_json(t)::text as before_mutations from public.work_tasks t where id = :'seller_a_todo' \gset
select throws_ok(format('update public.work_tasks set title = ''Forged'' where id = %L', :'seller_a_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'seller_a cannot edit title');
select throws_ok(format('update public.work_tasks set title = ''Forged'', status = ''done'' where id = %L', :'seller_a_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'seller_a cannot edit title with done');
select throws_ok(format('update public.work_tasks set description = ''Forged'' where id = %L', :'seller_a_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'seller_a cannot edit description');
select throws_ok(format('update public.work_tasks set description = ''Forged'', status = ''done'' where id = %L', :'seller_a_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'seller_a cannot edit description with done');
select throws_ok(format('update public.work_tasks set due_date = ''2026-01-01'' where id = %L', :'seller_a_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'seller_a cannot edit due_date');
select throws_ok(format('update public.work_tasks set due_date = ''2026-01-01'', status = ''done'' where id = %L', :'seller_a_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'seller_a cannot edit due_date with done');
select throws_ok(format('update public.work_tasks set important = true where id = %L', :'seller_a_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'seller_a cannot edit important');
select throws_ok(format('update public.work_tasks set important = true, status = ''done'' where id = %L', :'seller_a_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'seller_a cannot edit important with done');
select throws_ok(format('update public.work_tasks set created_by = %L where id = %L', :'seller_a', :'seller_a_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'seller_a cannot edit created_by');
select throws_ok(format('update public.work_tasks set created_by = %L, status = ''done'' where id = %L', :'seller_a', :'seller_a_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'seller_a cannot edit created_by with done');
select throws_ok(format('update public.work_tasks set created_at = ''2000-01-01Z'' where id = %L', :'seller_a_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'seller_a cannot edit created_at');
select throws_ok(format('update public.work_tasks set created_at = ''2000-01-01Z'', status = ''done'' where id = %L', :'seller_a_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'seller_a cannot edit created_at with done');
select throws_ok(format('update public.work_tasks set id = gen_random_uuid() where id = %L', :'seller_a_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'seller_a cannot edit id');
select throws_ok(format('update public.work_tasks set id = gen_random_uuid(), status = ''done'' where id = %L', :'seller_a_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'seller_a cannot edit id with done');
select throws_ok(format('update public.work_tasks set archived_at = now() where id = %L', :'seller_a_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'seller_a cannot edit archived_at');
select throws_ok(format('update public.work_tasks set archived_at = now(), status = ''done'' where id = %L', :'seller_a_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'seller_a cannot edit archived_at with done');
select throws_ok(format('update public.work_tasks set archived_by = %L where id = %L', :'owner_id', :'seller_a_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'seller_a cannot edit archived_by');
select throws_ok(format('update public.work_tasks set archived_by = %L, status = ''done'' where id = %L', :'owner_id', :'seller_a_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'seller_a cannot edit archived_by with done');
select throws_ok(format('update public.work_tasks set status = %L where id = %L', 'in_progress', :'seller_a_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'seller_a cannot start progress');
select is((select status from public.work_tasks where id = :'seller_a_todo'), 'todo', 'seller_a rejected writes leave status unchanged');
select is((select row_to_json(t)::text from public.work_tasks t where id = :'seller_a_todo'), :'before_mutations', 'seller_a forbidden edits leave entire row unchanged');
update public.work_tasks set status = 'done', completed_by = :'picker_a', completed_at = '2000-01-01Z', updated_at = '2000-01-01Z' where id = :'seller_a_todo';
select is((select completed_by from public.work_tasks where id = :'seller_a_todo'), :'seller_a'::uuid, 'seller_a done actor is caller');
select ok((select completed_at = date_trunc('milliseconds',now()) and updated_at = completed_at from public.work_tasks where id = :'seller_a_todo'), 'seller_a done timestamps are DB time');
update public.work_tasks set status = 'done' where id = :'seller_a_progress';
select is((select status from public.work_tasks where id = :'seller_a_progress'), 'done', 'seller_a progress to done allowed');
select row_to_json(t)::text as before_row from public.work_tasks t where id = :'seller_a_todo' \gset
update public.work_tasks set status = 'done', completed_at = '2000-01-01Z', completed_by = :'owner_id', updated_at = '2000-01-01Z' where id = :'seller_a_todo';
select is((select row_to_json(t)::text from public.work_tasks t where id = :'seller_a_todo'), :'before_row', 'seller_a repeated done preserves all metadata');
select throws_ok(format('update public.work_tasks set status = %L where id = %L', 'todo', :'seller_a_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'seller_a cannot reopen');
with changed as (update public.work_tasks set status = 'done' where id = :'owner_task' returning *) select is((select count(*) from changed), 0::bigint, 'seller_a guessed id changes zero rows');

select tests.login_as_user(:'seller_b');
select is((select count(*) from public.work_tasks), 2::bigint, 'seller_b reads assigned only');
select is((select count(*) from public.work_tasks where not public.is_work_task_assignee(id)), 0::bigint, 'seller_b cannot see peers or unassigned');
select is((select count(*) from public.profiles p join public.work_task_assignees a on a.profile_id = p.id join public.work_tasks t on t.id = a.task_id where p.id <> auth.uid()), 0::bigint, 'seller_b joins cannot leak peer tasks');
select is((select count(*) from public.audit_log), 0::bigint, 'seller_b cannot read audit');
select throws_ok($$select tests.task(auth.uid())$$, '42501', null, 'seller_b insert denied');
select throws_ok($$select public.archive_work_task(gen_random_uuid())$$, '42501', null, 'seller_b archive denied before lookup');
select row_to_json(t)::text as before_mutations from public.work_tasks t where id = :'seller_b_todo' \gset
select throws_ok(format('update public.work_tasks set title = ''Forged'' where id = %L', :'seller_b_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'seller_b cannot edit title');
select throws_ok(format('update public.work_tasks set title = ''Forged'', status = ''done'' where id = %L', :'seller_b_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'seller_b cannot edit title with done');
select throws_ok(format('update public.work_tasks set description = ''Forged'' where id = %L', :'seller_b_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'seller_b cannot edit description');
select throws_ok(format('update public.work_tasks set description = ''Forged'', status = ''done'' where id = %L', :'seller_b_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'seller_b cannot edit description with done');
select throws_ok(format('update public.work_tasks set due_date = ''2026-01-01'' where id = %L', :'seller_b_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'seller_b cannot edit due_date');
select throws_ok(format('update public.work_tasks set due_date = ''2026-01-01'', status = ''done'' where id = %L', :'seller_b_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'seller_b cannot edit due_date with done');
select throws_ok(format('update public.work_tasks set important = true where id = %L', :'seller_b_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'seller_b cannot edit important');
select throws_ok(format('update public.work_tasks set important = true, status = ''done'' where id = %L', :'seller_b_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'seller_b cannot edit important with done');
select throws_ok(format('update public.work_tasks set created_by = %L where id = %L', :'seller_b', :'seller_b_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'seller_b cannot edit created_by');
select throws_ok(format('update public.work_tasks set created_by = %L, status = ''done'' where id = %L', :'seller_b', :'seller_b_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'seller_b cannot edit created_by with done');
select throws_ok(format('update public.work_tasks set created_at = ''2000-01-01Z'' where id = %L', :'seller_b_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'seller_b cannot edit created_at');
select throws_ok(format('update public.work_tasks set created_at = ''2000-01-01Z'', status = ''done'' where id = %L', :'seller_b_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'seller_b cannot edit created_at with done');
select throws_ok(format('update public.work_tasks set id = gen_random_uuid() where id = %L', :'seller_b_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'seller_b cannot edit id');
select throws_ok(format('update public.work_tasks set id = gen_random_uuid(), status = ''done'' where id = %L', :'seller_b_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'seller_b cannot edit id with done');
select throws_ok(format('update public.work_tasks set archived_at = now() where id = %L', :'seller_b_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'seller_b cannot edit archived_at');
select throws_ok(format('update public.work_tasks set archived_at = now(), status = ''done'' where id = %L', :'seller_b_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'seller_b cannot edit archived_at with done');
select throws_ok(format('update public.work_tasks set archived_by = %L where id = %L', :'owner_id', :'seller_b_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'seller_b cannot edit archived_by');
select throws_ok(format('update public.work_tasks set archived_by = %L, status = ''done'' where id = %L', :'owner_id', :'seller_b_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'seller_b cannot edit archived_by with done');
select throws_ok(format('update public.work_tasks set status = %L where id = %L', 'in_progress', :'seller_b_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'seller_b cannot start progress');
select is((select status from public.work_tasks where id = :'seller_b_todo'), 'todo', 'seller_b rejected writes leave status unchanged');
select is((select row_to_json(t)::text from public.work_tasks t where id = :'seller_b_todo'), :'before_mutations', 'seller_b forbidden edits leave entire row unchanged');
update public.work_tasks set status = 'done', completed_by = :'picker_a', completed_at = '2000-01-01Z', updated_at = '2000-01-01Z' where id = :'seller_b_todo';
select is((select completed_by from public.work_tasks where id = :'seller_b_todo'), :'seller_b'::uuid, 'seller_b done actor is caller');
select ok((select completed_at = date_trunc('milliseconds',now()) and updated_at = completed_at from public.work_tasks where id = :'seller_b_todo'), 'seller_b done timestamps are DB time');
update public.work_tasks set status = 'done' where id = :'seller_b_progress';
select is((select status from public.work_tasks where id = :'seller_b_progress'), 'done', 'seller_b progress to done allowed');
select row_to_json(t)::text as before_row from public.work_tasks t where id = :'seller_b_todo' \gset
update public.work_tasks set status = 'done', completed_at = '2000-01-01Z', completed_by = :'owner_id', updated_at = '2000-01-01Z' where id = :'seller_b_todo';
select is((select row_to_json(t)::text from public.work_tasks t where id = :'seller_b_todo'), :'before_row', 'seller_b repeated done preserves all metadata');
select throws_ok(format('update public.work_tasks set status = %L where id = %L', 'todo', :'seller_b_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'seller_b cannot reopen');
with changed as (update public.work_tasks set status = 'done' where id = :'owner_task' returning *) select is((select count(*) from changed), 0::bigint, 'seller_b guessed id changes zero rows');

select tests.login_as_user(:'owner_id');
select is((select status from public.work_tasks where id = :'owner_task'), 'todo', 'other person row unchanged');
select tests.task(:'picker_a') as reassigned \gset
select tests.task(:'picker_a') as cleared \gset
select tests.task(:'picker_a', 'done') as archived \gset
select public.set_work_task_assignees(:'reassigned', array[:'seller_a'::uuid]);
select public.set_work_task_assignees(:'cleared', '{}');
select to_jsonb(t) - array['archived_at','archived_by','updated_at'] as before_archive from public.work_tasks t where id = :'archived' \gset
select public.archive_work_task(:'archived');
select is((select archived_by from public.work_tasks where id = :'archived'), :'owner_id'::uuid, 'archive actor is caller');
select is((select archived_at from public.work_tasks where id = :'archived'), date_trunc('milliseconds',now()), 'archive uses DB time');
select is((select (to_jsonb(t) - array['archived_at','archived_by','updated_at'])::text from public.work_tasks t where id = :'archived'), :'before_archive', 'archive preserves all business and completion fields');
select count(*) as archive_audits from public.audit_log where row_id = :'archived' \gset
select public.archive_work_task(:'archived');
select is((select count(*) from public.audit_log where row_id = :'archived'), :'archive_audits'::bigint, 'repeat archive no audit update');
select throws_ok(format('update public.work_tasks set archived_at = null, archived_by = null, title = ''Changed'' where id = %L', :'archived'), 'P0001', 'TASK_ARCHIVED', 'cannot restore archive with other edits');
select throws_ok(format('update public.work_tasks set title = %L where id = %L', 'Edit', :'archived'), 'P0001', 'TASK_ARCHIVED', 'cannot edit archive');
select throws_ok($$select public.archive_work_task('00000000-0000-0000-0000-000000000099')$$, 'P0001', 'PLANNING_NOT_FOUND', 'missing archive safe error');
select tests.task(:'seller_b') as forged_archive \gset
update public.work_tasks set archived_at = '2000-01-01Z', archived_by = :'picker_a', updated_at = '2000-01-01Z' where id = :'forged_archive';
select ok((select archived_by = auth.uid() and archived_at = date_trunc('milliseconds',now()) and updated_at = archived_at from public.work_tasks where id = :'forged_archive'), 'archive metadata cannot be spoofed');
select throws_ok(format('select public.set_work_task_assignees(%L, array[%L::uuid])', :'managed', :'inactive'), 'P0001', 'PLANNING_INACTIVE_PERSON', 'reassignment to inactive denied');
select tests.login_as_user(:'picker_a');
select is((select count(*) from public.work_tasks where id = :'archived'), 0::bigint, 'worker cannot read archive');
with changed as (update public.work_tasks set status = 'done' where id = :'reassigned' returning *) select is((select count(*) from changed), 0::bigint, 'stale reassigned completion affects zero rows');
with changed as (update public.work_tasks set status = 'done' where id = :'cleared' returning *) select is((select count(*) from changed), 0::bigint, 'stale cleared completion affects zero rows');
with changed as (update public.work_tasks set status = 'done' where id = :'archived' returning *) select is((select count(*) from changed), 0::bigint, 'stale archived completion affects zero rows');
select tests.login_as_user(:'owner_id');
select ok((select bool_and(completed_at is null and completed_by is null) from public.work_tasks where id in (:'reassigned', :'cleared')), 'stale completion stamps nothing');
update public.profiles set active = false where id = :'picker_a';
select ok(exists(select from public.work_tasks where id = :'archived'), 'inactive assignee archive remains owner-readable');
select tests.login_as_user(:'picker_a');
select is((select count(*) from public.work_tasks), 0::bigint, 'later inactive worker sees zero');
select tests.login_as_user(:'inactive');
select is((select count(*) from public.work_tasks), 0::bigint, 'inactive sees zero');
select throws_ok($$select tests.task(auth.uid())$$, '42501', null, 'inactive insert denied');
with changed as (update public.work_tasks set status = 'done' returning *) select is((select count(*) from changed), 0::bigint, 'inactive update zero rows');
select throws_ok($$select public.archive_work_task(gen_random_uuid())$$, '42501', null, 'inactive archive denied');
select tests.logout();
set local role anon;
select throws_ok($$select * from public.work_tasks$$, '42501', null, 'anon denied select');
select throws_ok($$insert into public.work_tasks(id,title) values (gen_random_uuid(),'X')$$, '42501', null, 'anon denied insert');
select throws_ok($$update public.work_tasks set status = 'done'$$, '42501', null, 'anon denied update');
select throws_ok($$delete from public.work_tasks$$, '42501', null, 'anon denied delete');
select throws_ok($$truncate public.work_tasks$$, '42501', null, 'anon denied truncate');
select throws_ok($$select public.archive_work_task(gen_random_uuid())$$, '42501', null, 'anon denied select');
reset role;
select ok((select relrowsecurity from pg_class where oid = 'public.work_tasks'::regclass), 'RLS enabled');
select has_index('public', 'work_task_assignees', 'work_task_assignees_profile_task', 'active task index exists');
select ok(not exists(select from pg_constraint where conrelid = 'public.work_tasks'::regclass and confrelid = 'public.profiles'::regclass and confdeltype <> 'r'), 'all profile FKs RESTRICT');
select throws_ok(format('delete from public.profiles where id = %L', :'seller_b'), '23503', null, 'task history restricts parent deletion');
select throws_ok($$delete from public.work_tasks$$, 'P0001', 'PLANNING_NO_DELETE', 'postgres delete blocked');
select ok(not has_table_privilege('anon', 'public.work_tasks', 'DELETE'), 'anon lacks DELETE');
select ok(not has_table_privilege('anon', 'public.work_tasks', 'TRUNCATE'), 'anon lacks TRUNCATE');
select ok(not has_table_privilege('authenticated', 'public.work_tasks', 'DELETE'), 'authenticated lacks DELETE');
select ok(not has_table_privilege('authenticated', 'public.work_tasks', 'TRUNCATE'), 'authenticated lacks TRUNCATE');
select ok(not has_table_privilege('service_role', 'public.work_tasks', 'DELETE'), 'service_role lacks DELETE');
select ok(not has_table_privilege('service_role', 'public.work_tasks', 'TRUNCATE'), 'service_role lacks TRUNCATE');
select is((select prosecdef from pg_proc where oid = 'public.work_tasks_guard()'::regprocedure), true, 'work_tasks_guard() security mode');
select ok((select proconfig @> array['search_path=""'] from pg_proc where oid = 'public.work_tasks_guard()'::regprocedure), 'work_tasks_guard() pins search path');
select ok(not has_function_privilege('anon', 'public.work_tasks_guard()', 'EXECUTE'), 'anon cannot execute work_tasks_guard()');
select is(has_function_privilege('authenticated', 'public.work_tasks_guard()', 'EXECUTE'), false, 'work_tasks_guard() execute contract');
select is((select prosecdef from pg_proc where oid = 'public.archive_work_task(uuid)'::regprocedure), false, 'archive_work_task(uuid) security mode');
select ok((select proconfig @> array['search_path=""'] from pg_proc where oid = 'public.archive_work_task(uuid)'::regprocedure), 'archive_work_task(uuid) pins search path');
select ok(not has_function_privilege('anon', 'public.archive_work_task(uuid)', 'EXECUTE'), 'anon cannot execute archive_work_task(uuid)');
select is(has_function_privilege('authenticated', 'public.archive_work_task(uuid)', 'EXECUTE'), true, 'archive_work_task(uuid) execute contract');
select tests.login_as_user(:'owner_id');
select throws_ok($$delete from public.work_tasks$$, '42501', null, 'owner delete denied by ACL');
select throws_ok(format('update public.work_tasks set id = gen_random_uuid() where id = %L', :'managed'), 'P0001', 'PLANNING_IMMUTABLE', 'owner cannot edit id');
select throws_ok(format('update public.work_tasks set created_by = %L where id = %L', :'seller_a', :'managed'), 'P0001', 'PLANNING_IMMUTABLE', 'owner cannot edit created_by');
select throws_ok(format('update public.work_tasks set created_at = ''2000-01-01Z'' where id = %L', :'managed'), 'P0001', 'PLANNING_IMMUTABLE', 'owner cannot edit created_at');
select ok(exists(select from public.audit_log where row_id = :'reassigned' and table_name = 'work_task_assignees' and action = 'DELETE' and data->'old'->>'profile_id' = :'picker_a' and actor = :'owner_id'), 'assignment audit old/new actor');
select ok(exists(select from public.audit_log where row_id = :'seller_a_todo' and data->'old'->>'status' = 'todo' and data->'new'->>'status' = 'done' and actor = :'seller_a'), 'completion audit old/new actor');
select ok(exists(select from public.audit_log where row_id = :'archived' and data->'old'->>'archived_at' is null and data->'new'->>'archived_at' is not null and actor = :'owner_id'), 'archive audit old/new actor');
select is((select count(*) from public.audit_log where row_id = :'seller_a_todo' and table_name = 'work_tasks' and action = 'UPDATE' and data->'new'->>'status' = 'done'), 1::bigint, 'repeated completion produces no audit update');
select ok(exists(select from public.audit_log where row_id = :'managed' and action = 'INSERT' and data->'new'->>'title' = 'Fixture task'), 'insert audit wraps new');
select tests.logout();
grant delete on public.work_tasks to authenticated;
create policy test_tasks_all on public.work_tasks for all to authenticated using (true) with check (true);
select tests.login_as_user(:'owner_id');
select throws_ok($$delete from public.work_tasks$$, 'P0001', 'PLANNING_NO_DELETE', 'owner temporary delete still blocked');
select tests.login_as_user(:'seller_b');
select throws_ok($$select tests.task(auth.uid())$$, '42501', null, 'guard blocks worker insert despite permissive policy');
select throws_ok(format('update public.work_tasks set status = %L where id = %L', 'done', :'managed'), 'P0001', 'TASK_COMPLETION_ONLY', 'guard checks current assignment despite permissive policy');
select throws_ok(format('update public.work_tasks set title = %L, status = %L where id = %L', 'Forged', 'done', :'seller_b_todo'), 'P0001', 'TASK_COMPLETION_ONLY', 'guard whitelist despite permissive policy');
select throws_ok(format('update public.work_tasks set status = %L where id = %L', 'done', :'archived'), 'P0001', 'TASK_ARCHIVED', 'archived fails before other transitions');
select tests.login_as_user(:'inactive');
select throws_ok($$update public.work_tasks set status = 'done'$$, '42501', null, 'guard blocks inactive despite permissive policy');
select tests.logout();
select throws_ok($$update public.work_tasks set status = 'done'$$, '42501', null, 'null identity guard fails closed');
select * from finish();
rollback;
