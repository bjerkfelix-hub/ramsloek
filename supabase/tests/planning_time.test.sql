begin;
create extension if not exists pgtap with schema extensions;
\ir helpers.psql
select no_plan();
select has_table('public', 'time_entries', 'time entries exist');

-- Invoker fixture helpers use the same authenticated RPCs as the application.
-- Fixture inputs use the stored millisecond precision, including transaction now().
create function tests.time_shift(p_person uuid, p_start timestamptz, p_end timestamptz)
returns uuid language sql as $$
  insert into public.work_shifts(id, profile_id, starts_at, ends_at, kind)
  values (gen_random_uuid(), p_person, p_start, p_end, 'other') returning id
$$;
create function tests.correct(p_id uuid, p_start timestamptz, p_end timestamptz,
  p_reason text default 'Fixture correction', p_fill boolean default false)
returns public.time_entries language sql as $$
  select public.correct_time_entry(p_id, date_trunc('milliseconds', p_start),
    date_trunc('milliseconds', p_end), p_reason,
    (select version from public.time_entries where id = p_id), p_fill)
$$;
grant execute on function tests.time_shift(uuid,timestamptz,timestamptz),
  tests.correct(uuid,timestamptz,timestamptz,text,boolean) to authenticated;

select tests.login_as('picker') as picker_a \gset
select tests.login_as('picker') as picker_b \gset
select tests.login_as('seller') as seller_a \gset
select tests.login_as('seller') as seller_b \gset
select tests.login_as('picker') as inactive \gset
select tests.login_as('owner') as owner_id \gset
update public.profiles set active = false where id = :'inactive';
insert into public.work_rates(profile_id, hourly_rate_ore) values
  (:'picker_a', 25000), (:'seller_a', 30000), (:'seller_b', 10000), (:'owner_id', 0);
select date_trunc('milliseconds', now()) as db_now \gset
select gen_random_uuid() as shared_key \gset
select tests.time_shift(:'picker_a', :'db_now', :'db_now'::timestamptz + interval '1 hour') as linked_shift \gset
select tests.time_shift(:'picker_b', :'db_now'::timestamptz - interval '1 hour', :'db_now') as ended_shift \gset
select tests.time_shift(:'seller_a', :'db_now', :'db_now'::timestamptz + interval '1 hour') as cancelled_shift \gset
select public.cancel_work_shift(:'cancelled_shift', 'Cancelled fixture');
select tests.time_shift(:'owner_id', :'db_now'::timestamptz + interval '1 hour', :'db_now'::timestamptz + interval '2 hours') as unlinked_shift \gset

select tests.login_as_user(:'picker_a');
select (public.clock_in(:'shared_key')).id as entry_picker_a \gset
select is((select profile_id from public.time_entries where id = :'entry_picker_a'), auth.uid(), 'picker_a clocks self');
select is((select started_at from public.time_entries where id = :'entry_picker_a'), :'db_now'::timestamptz, 'picker_a start uses millisecond DB time');
select is((select ended_at from public.time_entries where id = :'entry_picker_a'), null::timestamptz, 'picker_a starts open');
select is((select hourly_rate_ore from public.time_entries where id = :'entry_picker_a'), 25000, 'picker_a snapshot preserves missing and zero');
select is((select shift_id from public.time_entries where id = :'entry_picker_a'), :'linked_shift'::uuid, 'picker_a half-open matching excludes ended/cancelled/other shifts');
select is((select version from public.time_entries where id = :'entry_picker_a'), 1::bigint, 'picker_a insert version is one');
select is((public.clock_in(:'shared_key')).id, :'entry_picker_a'::uuid, 'picker_a same-key retry returns original');
select throws_ok('select public.clock_in(gen_random_uuid())', 'P0001', 'TIME_ALREADY_OPEN', 'picker_a second Start denied');
select throws_ok('insert into public.time_entries(profile_id,start_key) values (auth.uid(),gen_random_uuid())', '42501', null, 'picker_a direct insert denied');
select throws_ok('update public.time_entries set ended_at = now()', '42501', null, 'picker_a direct update denied');
select throws_ok('delete from public.time_entries', '42501', null, 'picker_a direct delete denied');
select is((select count(*) from public.time_entries), 1::bigint, 'picker_a sees only own entry');
select is((select count(*) from public.time_entries where profile_id <> auth.uid()), 0::bigint, 'picker_a same-role and cross-role entries hidden');
select is((select count(*) from public.profiles p join public.time_entries t on t.profile_id=p.id where p.id <> auth.uid()), 0::bigint, 'picker_a embedded profile joins preserve RLS');
select is((select count(*) from public.audit_log), 0::bigint, 'picker_a cannot read audit/rates through history');
select throws_ok(format('select tests.correct(%L, now(), now())', :'entry_picker_a'), '42501', null, 'picker_a cannot correct even guessed entries');
select throws_ok('select public.clock_out(gen_random_uuid())', 'P0001', 'PLANNING_NOT_FOUND', 'picker_a missing Stop id has safe error');

select tests.login_as_user(:'picker_b');
select (public.clock_in(:'shared_key')).id as entry_picker_b \gset
select is((select profile_id from public.time_entries where id = :'entry_picker_b'), auth.uid(), 'picker_b clocks self');
select is((select started_at from public.time_entries where id = :'entry_picker_b'), :'db_now'::timestamptz, 'picker_b start uses millisecond DB time');
select is((select ended_at from public.time_entries where id = :'entry_picker_b'), null::timestamptz, 'picker_b starts open');
select is((select hourly_rate_ore from public.time_entries where id = :'entry_picker_b'), null::integer, 'picker_b snapshot preserves missing and zero');
select is((select shift_id from public.time_entries where id = :'entry_picker_b'), null::uuid, 'picker_b half-open matching excludes ended/cancelled/other shifts');
select is((select version from public.time_entries where id = :'entry_picker_b'), 1::bigint, 'picker_b insert version is one');
select is((public.clock_in(:'shared_key')).id, :'entry_picker_b'::uuid, 'picker_b same-key retry returns original');
select throws_ok('select public.clock_in(gen_random_uuid())', 'P0001', 'TIME_ALREADY_OPEN', 'picker_b second Start denied');
select throws_ok('insert into public.time_entries(profile_id,start_key) values (auth.uid(),gen_random_uuid())', '42501', null, 'picker_b direct insert denied');
select throws_ok('update public.time_entries set ended_at = now()', '42501', null, 'picker_b direct update denied');
select throws_ok('delete from public.time_entries', '42501', null, 'picker_b direct delete denied');
select is((select count(*) from public.time_entries), 1::bigint, 'picker_b sees only own entry');
select is((select count(*) from public.time_entries where profile_id <> auth.uid()), 0::bigint, 'picker_b same-role and cross-role entries hidden');
select is((select count(*) from public.profiles p join public.time_entries t on t.profile_id=p.id where p.id <> auth.uid()), 0::bigint, 'picker_b embedded profile joins preserve RLS');
select is((select count(*) from public.audit_log), 0::bigint, 'picker_b cannot read audit/rates through history');
select throws_ok(format('select tests.correct(%L, now(), now())', :'entry_picker_a'), '42501', null, 'picker_b cannot correct even guessed entries');
select throws_ok('select public.clock_out(gen_random_uuid())', 'P0001', 'PLANNING_NOT_FOUND', 'picker_b missing Stop id has safe error');

select tests.login_as_user(:'seller_a');
select (public.clock_in(:'shared_key')).id as entry_seller_a \gset
select is((select profile_id from public.time_entries where id = :'entry_seller_a'), auth.uid(), 'seller_a clocks self');
select is((select started_at from public.time_entries where id = :'entry_seller_a'), :'db_now'::timestamptz, 'seller_a start uses millisecond DB time');
select is((select ended_at from public.time_entries where id = :'entry_seller_a'), null::timestamptz, 'seller_a starts open');
select is((select hourly_rate_ore from public.time_entries where id = :'entry_seller_a'), 30000, 'seller_a snapshot preserves missing and zero');
select is((select shift_id from public.time_entries where id = :'entry_seller_a'), null::uuid, 'seller_a half-open matching excludes ended/cancelled/other shifts');
select is((select version from public.time_entries where id = :'entry_seller_a'), 1::bigint, 'seller_a insert version is one');
select is((public.clock_in(:'shared_key')).id, :'entry_seller_a'::uuid, 'seller_a same-key retry returns original');
select throws_ok('select public.clock_in(gen_random_uuid())', 'P0001', 'TIME_ALREADY_OPEN', 'seller_a second Start denied');
select throws_ok('insert into public.time_entries(profile_id,start_key) values (auth.uid(),gen_random_uuid())', '42501', null, 'seller_a direct insert denied');
select throws_ok('update public.time_entries set ended_at = now()', '42501', null, 'seller_a direct update denied');
select throws_ok('delete from public.time_entries', '42501', null, 'seller_a direct delete denied');
select is((select count(*) from public.time_entries), 1::bigint, 'seller_a sees only own entry');
select is((select count(*) from public.time_entries where profile_id <> auth.uid()), 0::bigint, 'seller_a same-role and cross-role entries hidden');
select is((select count(*) from public.profiles p join public.time_entries t on t.profile_id=p.id where p.id <> auth.uid()), 0::bigint, 'seller_a embedded profile joins preserve RLS');
select is((select count(*) from public.audit_log), 0::bigint, 'seller_a cannot read audit/rates through history');
select throws_ok(format('select tests.correct(%L, now(), now())', :'entry_picker_a'), '42501', null, 'seller_a cannot correct even guessed entries');
select throws_ok('select public.clock_out(gen_random_uuid())', 'P0001', 'PLANNING_NOT_FOUND', 'seller_a missing Stop id has safe error');

select tests.login_as_user(:'seller_b');
select (public.clock_in(:'shared_key')).id as entry_seller_b \gset
select is((select profile_id from public.time_entries where id = :'entry_seller_b'), auth.uid(), 'seller_b clocks self');
select is((select started_at from public.time_entries where id = :'entry_seller_b'), :'db_now'::timestamptz, 'seller_b start uses millisecond DB time');
select is((select ended_at from public.time_entries where id = :'entry_seller_b'), null::timestamptz, 'seller_b starts open');
select is((select hourly_rate_ore from public.time_entries where id = :'entry_seller_b'), 10000, 'seller_b snapshot preserves missing and zero');
select is((select shift_id from public.time_entries where id = :'entry_seller_b'), null::uuid, 'seller_b half-open matching excludes ended/cancelled/other shifts');
select is((select version from public.time_entries where id = :'entry_seller_b'), 1::bigint, 'seller_b insert version is one');
select is((public.clock_in(:'shared_key')).id, :'entry_seller_b'::uuid, 'seller_b same-key retry returns original');
select throws_ok('select public.clock_in(gen_random_uuid())', 'P0001', 'TIME_ALREADY_OPEN', 'seller_b second Start denied');
select throws_ok('insert into public.time_entries(profile_id,start_key) values (auth.uid(),gen_random_uuid())', '42501', null, 'seller_b direct insert denied');
select throws_ok('update public.time_entries set ended_at = now()', '42501', null, 'seller_b direct update denied');
select throws_ok('delete from public.time_entries', '42501', null, 'seller_b direct delete denied');
select is((select count(*) from public.time_entries), 1::bigint, 'seller_b sees only own entry');
select is((select count(*) from public.time_entries where profile_id <> auth.uid()), 0::bigint, 'seller_b same-role and cross-role entries hidden');
select is((select count(*) from public.profiles p join public.time_entries t on t.profile_id=p.id where p.id <> auth.uid()), 0::bigint, 'seller_b embedded profile joins preserve RLS');
select is((select count(*) from public.audit_log), 0::bigint, 'seller_b cannot read audit/rates through history');
select throws_ok(format('select tests.correct(%L, now(), now())', :'entry_picker_a'), '42501', null, 'seller_b cannot correct even guessed entries');
select throws_ok('select public.clock_out(gen_random_uuid())', 'P0001', 'PLANNING_NOT_FOUND', 'seller_b missing Stop id has safe error');

select tests.login_as_user(:'owner_id');
select (public.clock_in(:'shared_key')).id as entry_owner_id \gset
select is((select profile_id from public.time_entries where id = :'entry_owner_id'), auth.uid(), 'owner_id clocks self');
select is((select started_at from public.time_entries where id = :'entry_owner_id'), :'db_now'::timestamptz, 'owner_id start uses millisecond DB time');
select is((select ended_at from public.time_entries where id = :'entry_owner_id'), null::timestamptz, 'owner_id starts open');
select is((select hourly_rate_ore from public.time_entries where id = :'entry_owner_id'), 0, 'owner_id snapshot preserves missing and zero');
select is((select shift_id from public.time_entries where id = :'entry_owner_id'), null::uuid, 'owner_id half-open matching excludes ended/cancelled/other shifts');
select is((select version from public.time_entries where id = :'entry_owner_id'), 1::bigint, 'owner_id insert version is one');
select is((public.clock_in(:'shared_key')).id, :'entry_owner_id'::uuid, 'owner_id same-key retry returns original');
select throws_ok('select public.clock_in(gen_random_uuid())', 'P0001', 'TIME_ALREADY_OPEN', 'owner_id second Start denied');
select throws_ok('insert into public.time_entries(profile_id,start_key) values (auth.uid(),gen_random_uuid())', '42501', null, 'owner_id direct insert denied');
select throws_ok('update public.time_entries set ended_at = now()', '42501', null, 'owner_id direct update denied');
select throws_ok('delete from public.time_entries', '42501', null, 'owner_id direct delete denied');

select is((select count(*) from public.time_entries), 5::bigint, 'owner reads every person');
select is((select count(*) from public.audit_log where table_name='time_entries' and action='INSERT'), 5::bigint, 'same-key retries produce exactly one insert each');
select throws_ok(format('select public.clock_out(%L)', :'entry_picker_a'), 'P0001', 'PLANNING_NOT_FOUND', 'owner Stopp cannot target another person');
select tests.login_as_user(:'picker_a');
select throws_ok(format('select public.clock_out(%L)', :'entry_picker_b'), 'P0001', 'PLANNING_NOT_FOUND', 'same-role hidden Stop id has safe error');
select throws_ok(format('select public.clock_out(%L)', :'entry_seller_a'), 'P0001', 'PLANNING_NOT_FOUND', 'cross-role hidden Stop id has safe error');
select tests.login_as_user(:'owner_id');
select throws_ok(format('update public.work_shifts set profile_id=%L where id=%L', :'picker_b', :'linked_shift'), 'P0001', 'SHIFT_HAS_TIME', 'linked shift cannot be reassigned');
select lives_ok(format('update public.work_shifts set profile_id=%L where id=%L', :'seller_b', :'unlinked_shift'), 'unlinked shift may be reassigned');
update public.work_shifts set starts_at = starts_at - interval '2 hours', ends_at = ends_at - interval '2 hours' where id=:'linked_shift';
select is((select shift_id from public.time_entries where id=:'entry_picker_a'), :'linked_shift'::uuid, 'editing linked shift does not relink entry');
select public.cancel_work_shift(:'linked_shift', 'Cancelled after clock in');
select is((select shift_id from public.time_entries where id=:'entry_picker_a'), :'linked_shift'::uuid, 'cancelling linked shift preserves link');
update public.work_rates set hourly_rate_ore=30000 where profile_id=:'picker_a';
select is((select hourly_rate_ore from public.time_entries where id=:'entry_picker_a'), 25000, 'rate edits never reprice existing snapshot');
select throws_ok(format('select tests.correct(%L, now(), now(), %L, true)', :'entry_picker_a', 'Reprice attempt'), 'P0001', 'TIME_RATE', 'existing snapshot cannot be replaced even with current rate');
select throws_ok(format('select tests.correct(%L, now(), now(), %L, true)', :'entry_picker_b', 'Missing rate'), 'P0001', 'TIME_RATE', 'missing snapshot cannot fill without current rate');
insert into public.work_rates(profile_id,hourly_rate_ore) values (:'picker_b',30000);
select lives_ok(format('select tests.correct(%L, %L, null, %L, true)', :'entry_picker_b', :'db_now', ' Fill missing snapshot '), 'owner fills missing snapshot from current rate');
select is((select hourly_rate_ore from public.time_entries where id=:'entry_picker_b'), 30000, 'fill uses current rate');
select is((select correction_reason from public.time_entries where id=:'entry_picker_b'), 'Fill missing snapshot', 'reason trimmed');
select is((select data->'old'->'hourly_rate_ore' from public.audit_log where row_id=:'entry_picker_b' and action='UPDATE' order by id desc limit 1), 'null'::jsonb, 'fill audit retains missing old rate');
select is((select data->'new'->>'hourly_rate_ore' from public.audit_log where row_id=:'entry_picker_b' and action='UPDATE' order by id desc limit 1), '30000', 'fill audit records new rate');
select throws_ok(format('select tests.correct(%L, now(), now(), %L, true)', :'entry_picker_b', 'Fill twice'), 'P0001', 'TIME_RATE', 'snapshot fill is one-time');
select throws_ok(format('select tests.correct(%L, now(), now(), %L)', :'entry_picker_a', ''), 'P0001', 'TIME_REASON', 'correction rejects reason length 0');
select throws_ok(format('select tests.correct(%L, now(), now(), %L)', :'entry_picker_a', '  '), 'P0001', 'TIME_REASON', 'correction rejects reason length 2');
select throws_ok(format('select tests.correct(%L, now(), now(), %L)', :'entry_picker_a', 'ab'), 'P0001', 'TIME_REASON', 'correction rejects reason length 2');
select throws_ok(format('select tests.correct(%L, now(), now(), %L)', :'entry_picker_a', repeat('x',501)), 'P0001', 'TIME_REASON', 'correction rejects reason length 501');
select throws_ok(format('select tests.correct(%L, now() + interval ''1 millisecond'', null)', :'entry_picker_a'), 'P0001', 'TIME_INTERVAL', 'future/nonfinite/null/inverted correction rejected');
select throws_ok(format('select tests.correct(%L, now(), now() + interval ''1 second'')', :'entry_picker_a'), 'P0001', 'TIME_INTERVAL', 'future/nonfinite/null/inverted correction rejected');
select throws_ok(format('select tests.correct(%L, ''infinity''::timestamptz, null)', :'entry_picker_a'), 'P0001', 'TIME_INTERVAL', 'future/nonfinite/null/inverted correction rejected');
select throws_ok(format('select tests.correct(%L, ''-infinity''::timestamptz, null)', :'entry_picker_a'), 'P0001', 'TIME_INTERVAL', 'future/nonfinite/null/inverted correction rejected');
select throws_ok(format('select tests.correct(%L, null, null)', :'entry_picker_a'), 'P0001', 'TIME_INTERVAL', 'future/nonfinite/null/inverted correction rejected');
select throws_ok(format('select tests.correct(%L, now(), now() - interval ''1 hour'')', :'entry_picker_a'), 'P0001', 'TIME_INTERVAL', 'future/nonfinite/null/inverted correction rejected');

select count(*) as audit_before from public.audit_log where row_id=:'entry_picker_a' \gset
select throws_ok(format('select public.correct_time_entry(%L, now(), null, %L, 999)', :'entry_picker_a', 'Stale correction'), 'P0001', 'PLANNING_STALE', 'stale correction rejected under lock');
select is((select version from public.time_entries where id=:'entry_picker_a'), 1::bigint, 'stale correction preserves row version');
select is((select count(*) from public.audit_log where row_id=:'entry_picker_a'), :'audit_before'::bigint, 'stale correction preserves audit');
select lives_ok(format('select tests.correct(%L, date_trunc(%L,now()) - interval %L, null, %L)', :'entry_picker_a', 'milliseconds', '14 hours', 'abc'), 'three-character reason accepted');
select is((select started_at < date_trunc('milliseconds',now()) - interval '14 hours' and ended_at is null from public.time_entries where id=:'entry_picker_a'), false, 'exactly 14 hours is not forgotten');
select lives_ok(format('select tests.correct(%L, date_trunc(%L,now()) - interval %L, null, %L)', :'entry_picker_a', 'milliseconds', '14 hours 0.001 seconds', repeat('x',500)), '500-character reason accepted');
select is((select started_at < date_trunc('milliseconds',now()) - interval '14 hours' and ended_at is null from public.time_entries where id=:'entry_picker_a'), true, '14 hours plus 1ms is forgotten');
select is((select shift_id from public.time_entries where id=:'entry_picker_a'), :'linked_shift'::uuid, 'corrected start outside shift retains link');
select is((select corrected_at from public.time_entries where id=:'entry_picker_a'), :'db_now'::timestamptz, 'correction DB timestamp');
select is((select corrected_by from public.time_entries where id=:'entry_picker_a'), :'owner_id'::uuid, 'correction actor is owner');
select is((select data->'old'->>'started_at' from public.audit_log where row_id=:'entry_picker_a' and action='UPDATE' order by id desc limit 1)::timestamptz, :'db_now'::timestamptz - interval '14 hours', 'audit old start retained');
select is((select data->'new'->>'started_at' from public.audit_log where row_id=:'entry_picker_a' and action='UPDATE' order by id desc limit 1)::timestamptz, :'db_now'::timestamptz - interval '14 hours 0.001 seconds', 'audit corrected start retained');
select is((select actor from public.audit_log where row_id=:'entry_picker_a' and action='UPDATE' order by id desc limit 1), :'owner_id'::uuid, 'audit correction actor');
select tests.login_as_user(:'picker_a');
select is((public.clock_out(:'entry_picker_a')).ended_at, :'db_now'::timestamptz, 'Stopp uses DB millisecond time');
select is((select version from public.time_entries where id=:'entry_picker_a'), 4::bigint, 'corrections and Stopp increment version');
select is((select correction_reason from public.time_entries where id=:'entry_picker_a'), repeat('x',500), 'ordinary Stopp preserves earlier correction reason');
select is((select corrected_by from public.time_entries where id=:'entry_picker_a'), :'owner_id'::uuid, 'ordinary Stopp preserves correction actor');
select is((select started_at < date_trunc('milliseconds',now()) - interval '14 hours' and ended_at is null from public.time_entries where id=:'entry_picker_a'), false, 'closed entry is never forgotten');
select is((public.clock_in(:'shared_key')).id, :'entry_picker_a'::uuid, 'Start retry after close returns original closed row');
select (public.clock_in(gen_random_uuid())).id as next_entry \gset
select is((public.clock_out(:'entry_picker_a')).id, :'entry_picker_a'::uuid, 'retry targets original closed id');
select is((select ended_at from public.time_entries where id=:'next_entry'), null::timestamptz, 'stale Stop does not stop next entry');
select tests.login_as_user(:'owner_id');
select is((select count(*) from public.audit_log where row_id=:'entry_picker_a'), 4::bigint, 'Start/Stop retries do not add audit events');
select throws_ok(format('select tests.correct(%L, now(), null)', :'entry_picker_a'), 'P0001', 'TIME_ALREADY_OPEN', 'cannot reopen a second open entry');
select throws_ok(format('select tests.correct(%L, now() - interval %L, now())', :'next_entry', '1 hour'), 'P0001', 'TIME_OVERLAP', 'overlapping closed correction rejected atomically');
select tests.login_as_user(:'picker_a');
select public.clock_out(:'next_entry');
select tests.login_as_user(:'owner_id');
select lives_ok(format('select tests.correct(%L, now(), null)', :'entry_picker_a'), 'owner may reopen closed entry when constraints permit');
select lives_ok(format('select tests.correct(%L, now(), now())', :'entry_picker_a'), 'owner may retain zero-duration correction');
select is((select ended_at=started_at from public.time_entries where id=:'entry_picker_a'), true, 'zero correction persisted');
select throws_ok('select public.correct_time_entry(gen_random_uuid(), now(), now(), ''Reason'', 1)', 'P0001', 'PLANNING_NOT_FOUND', 'missing correction id has safe error');
select throws_ok('select public.correct_time_entry(gen_random_uuid(), now(), now(), '' '', 1)', 'P0001', 'TIME_REASON', 'reason validated on every call before lookup');

-- Historical fixtures have separate authenticated people; no trigger disabling/backdating inserts.
select tests.login_as('picker') as person_midnight \gset
select tests.login_as_user(:'owner_id');
insert into public.work_rates(profile_id,hourly_rate_ore) values (:'person_midnight',25000);
select tests.time_shift(:'person_midnight', '2026-03-31T21:30Z', '2026-03-31T22:30Z') as report_shift \gset
select tests.login_as_user(:'person_midnight');
select (public.clock_in(gen_random_uuid())).id as report_midnight \gset
select tests.login_as_user(:'owner_id');
select tests.correct(:'report_midnight', '2026-03-31T21:30Z', '2026-03-31T22:30Z');
select tests.login_as('picker') as person_minutes \gset
select tests.login_as_user(:'owner_id');
insert into public.work_rates(profile_id,hourly_rate_ore) values (:'person_minutes',10000);
select tests.login_as_user(:'person_minutes');
select (public.clock_in(gen_random_uuid())).id as report_minutes \gset
select tests.login_as_user(:'owner_id');
select tests.correct(:'report_minutes', '2026-04-02T08:00Z', '2026-04-02T08:01Z');
select tests.login_as('picker') as person_spring \gset
select tests.login_as_user(:'owner_id');
insert into public.work_rates(profile_id,hourly_rate_ore) values (:'person_spring',25000);
select tests.login_as_user(:'person_spring');
select (public.clock_in(gen_random_uuid())).id as report_spring \gset
select tests.login_as_user(:'owner_id');
select tests.correct(:'report_spring', '2026-03-29T00:30Z', '2026-03-29T01:30Z');
select tests.login_as('picker') as person_autumn \gset
select tests.login_as_user(:'owner_id');
insert into public.work_rates(profile_id,hourly_rate_ore) values (:'person_autumn',25000);
select tests.login_as_user(:'person_autumn');
select (public.clock_in(gen_random_uuid())).id as report_autumn \gset
select tests.login_as_user(:'owner_id');
select tests.correct(:'report_autumn', '2026-10-25T00:30Z', '2026-10-25T01:30Z');
select tests.login_as('picker') as person_zero \gset
select tests.login_as_user(:'owner_id');
insert into public.work_rates(profile_id,hourly_rate_ore) values (:'person_zero',0);
select tests.login_as_user(:'person_zero');
select (public.clock_in(gen_random_uuid())).id as report_zero \gset
select tests.login_as_user(:'owner_id');
select tests.correct(:'report_zero', '2026-04-03T08:00Z', '2026-04-03T08:00Z');
select tests.login_as('picker') as person_missing \gset
select tests.login_as_user(:'owner_id');
select tests.login_as_user(:'person_missing');
select (public.clock_in(gen_random_uuid())).id as report_missing \gset
select tests.login_as_user(:'owner_id');
select tests.correct(:'report_missing', '2026-04-04T08:00Z', '2026-04-04T09:00Z');
select tests.login_as('picker') as person_half_ore \gset
select tests.login_as_user(:'owner_id');
insert into public.work_rates(profile_id,hourly_rate_ore) values (:'person_half_ore',100000);
select tests.login_as_user(:'person_half_ore');
select (public.clock_in(gen_random_uuid())).id as report_half_ore \gset
select tests.login_as_user(:'owner_id');
select tests.correct(:'report_half_ore', '2026-04-05T08:00Z', '2026-04-05T08:00:00.018Z');

select tests.login_as_user(:'person_minutes');
select (public.clock_in(gen_random_uuid())).id as report_minute_two \gset
select tests.login_as_user(:'owner_id');
select tests.correct(:'report_minute_two', '2026-04-02T09:00Z', '2026-04-02T09:01Z');
update public.work_rates set hourly_rate_ore=30000 where profile_id=:'person_midnight';
select results_eq(format('select work_date,duration_ms,amount_ore from public.planning_daily(%L,%L) where source_id=%L order by work_date', '2026-03-01','2026-04-30',:'report_midnight'), $$values ('2026-03-31'::date,1800000::bigint,12500::bigint),('2026-04-01'::date,1800000::bigint,12500::bigint)$$, 'daily report splits midnight and pays each exact segment');
select is((select count(*) from public.planning_daily('2026-03-01','2026-03-31') where source_id=:'report_midnight'), 1::bigint, 'March excludes April segment');
select is((select amount_ore from public.planning_daily('2026-03-31','2026-03-31') where source_id=:'report_shift'), 15000::bigint, 'planned amount uses current rate');
select is((select sum(amount_ore)::bigint from public.planning_daily('2026-04-02','2026-04-02') where profile_id=:'person_minutes' and source_kind='time'), 334::bigint, 'two same-day minutes round separately to 167 plus 167');
select is((select count(*) from public.planning_daily('2026-04-02','2026-04-02') where profile_id=:'person_minutes' and source_kind='time'), 2::bigint, 'report retains distinct entries per day');
select is((select duration_ms from public.planning_daily('2026-03-29','2026-03-29') where source_id=:'report_spring'), 3600000::bigint, 'spring DST uses elapsed milliseconds');
select is((select duration_ms from public.planning_daily('2026-10-25','2026-10-25') where source_id=:'report_autumn'), 3600000::bigint, 'autumn repeated hour uses elapsed milliseconds');
select results_eq(format('select duration_ms,hourly_rate_ore,amount_ore from public.planning_daily(%L,%L) where source_id=%L', '2026-04-03','2026-04-03',:'report_zero'), $$select 0::bigint,0,0::bigint$$, 'zero duration emits exactly one zero-rate zero-amount row');
select is((select amount_ore from public.planning_daily('2026-04-04','2026-04-04') where source_id=:'report_missing'), null::bigint, 'missing snapshot gives null amount');
select is((select amount_ore from public.planning_daily('2026-04-05','2026-04-05') where source_id=:'report_half_ore'), 1::bigint, 'half ore rounds up using exact arithmetic');
select is((select count(*) from public.planning_daily((now() at time zone 'Europe/Oslo')::date,(now() at time zone 'Europe/Oslo')::date) where source_id in (:'entry_seller_a',:'entry_seller_b',:'cancelled_shift',:'linked_shift')), 0::bigint, 'open entries and cancelled shifts absent from reports');
select tests.login_as_user(:'person_midnight');
select is((select count(*) from public.planning_daily('2026-03-01','2026-04-30')), 4::bigint, 'worker report contains own two planned and two worked segments');
select is((select count(*) from public.planning_daily('2026-01-01','2026-12-31') where profile_id<>auth.uid()), 0::bigint, 'worker aggregate report never leaks other people');
select tests.login_as_user(:'seller_a');
select is((select count(*) from public.planning_daily('2026-03-01','2026-04-30')), 0::bigint, 'seller report emits no names or empty rows for other profiles');
select tests.login_as_user(:'owner_id');
select ok((select count(distinct profile_id)>1 from public.planning_daily('2026-01-01','2026-12-31')), 'owner report sees all people');
select lives_ok($$select * from public.planning_daily('2028-01-01','2028-12-31')$$, 'inclusive 366 days accepted');
select throws_ok('select * from public.planning_daily(null,''2026-01-01'')', 'P0001', 'PLANNING_PERIOD', 'null/inverted/367-day/nonfinite period rejected');
select throws_ok('select * from public.planning_daily(''2026-01-01'',null)', 'P0001', 'PLANNING_PERIOD', 'null/inverted/367-day/nonfinite period rejected');
select throws_ok('select * from public.planning_daily(''2026-02-01'',''2026-01-01'')', 'P0001', 'PLANNING_PERIOD', 'null/inverted/367-day/nonfinite period rejected');
select throws_ok('select * from public.planning_daily(''2026-01-01'',''2027-01-02'')', 'P0001', 'PLANNING_PERIOD', 'null/inverted/367-day/nonfinite period rejected');
select throws_ok('select * from public.planning_daily(''-infinity'',''2026-01-01'')', 'P0001', 'PLANNING_PERIOD', 'null/inverted/367-day/nonfinite period rejected');
select throws_ok('select * from public.planning_daily(''2026-01-01'',''infinity'')', 'P0001', 'PLANNING_PERIOD', 'null/inverted/367-day/nonfinite period rejected');

-- Validate RPC input before timestamptz(3) can round away invalid ordering/future values.
select throws_ok(format('select public.correct_time_entry(%L, %L::timestamptz + interval %L, null, %L, (select version from public.time_entries where id=%L))', :'report_half_ore', :'db_now', '0.000001 seconds', 'Future submillisecond', :'report_half_ore'), 'P0001', 'TIME_INTERVAL', 'submillisecond future input cannot round into the present');
select throws_ok(format('select public.correct_time_entry(%L, %L, %L, %L, (select version from public.time_entries where id=%L))', :'report_half_ore', '2026-04-05T08:00:00.0004Z', '2026-04-05T08:00:00.0003Z', 'Inverted submillisecond', :'report_half_ore'), 'P0001', 'TIME_INTERVAL', 'inverted submillisecond interval cannot round into zero');

select tests.login_as_user(:'seller_a');
select is((public.clock_out(:'entry_seller_a')).ended_at, :'db_now'::timestamptz, 'seller Stopp uses DB time');
select tests.login_as_user(:'seller_b');
select is((public.clock_out(:'entry_seller_b')).ended_at, :'db_now'::timestamptz, 'second seller clocks own entry out');
select tests.login_as_user(:'owner_id');
select is((public.clock_out(:'entry_owner_id')).ended_at, :'db_now'::timestamptz, 'owner clocks own entry out');
select is((select corrected_at from public.time_entries where id=:'entry_owner_id'), null::timestamptz, 'ordinary owner Stop is not a correction');

update public.profiles set active=false where id=:'picker_b';
select lives_ok(format('select tests.correct(%L, now(), now(), %L)', :'entry_picker_b', 'Inactive historical correction'), 'owner corrects inactive person history');
select tests.login_as_user(:'picker_b');
select is((select count(*) from public.time_entries), 0::bigint, 'later-inactive person cannot read own retained time');
select tests.login_as_user(:'inactive');
select is((select count(*) from public.time_entries), 0::bigint, 'inactive SELECT has no rows');
select throws_ok('select public.clock_in(gen_random_uuid())', '42501', null, 'inactive Start denied');
select throws_ok(format('select public.clock_out(%L)', :'entry_picker_a'), '42501', null, 'inactive Stop denied before lookup');
select throws_ok(format('select tests.correct(%L,now(),now())', :'entry_picker_a'), '42501', null, 'inactive correction denied');
select throws_ok($$select * from public.planning_daily('2026-01-01','2026-01-01')$$, '42501', null, 'inactive report denied');
select tests.logout();
set local role anon;
select throws_ok('select * from public.time_entries', '42501', null, 'anon SELECT denied by ACL');
select throws_ok('select public.clock_in(gen_random_uuid())', '42501', null, 'anon Start lacks execute');
select throws_ok('select public.clock_out(gen_random_uuid())', '42501', null, 'anon Stop lacks execute');
select throws_ok('select public.correct_time_entry(gen_random_uuid(),now(),now(),''Reason'',1)', '42501', null, 'anon correction lacks execute');
select throws_ok($$select * from public.planning_daily('2026-01-01','2026-01-01')$$, '42501', null, 'anon report lacks execute');
reset role;

-- Structural constraints, grants and function security are part of the public contract.
select ok((select relrowsecurity from pg_class where oid='public.time_entries'::regclass), 'time_entries RLS enabled');
select has_index('public','time_entries','time_entries_one_open', 'explicit one-open index exists');
select is((select pg_get_expr(indpred,indrelid) from pg_index where indexrelid='public.time_entries_one_open'::regclass), '(ended_at IS NULL)', 'one-open predicate is exact');
select ok((select indisunique and indnkeyatts=1 from pg_index where indexrelid='public.time_entries_one_open'::regclass), 'one-open is unique by person');
select alike((select pg_get_indexdef('public.time_entries_one_open'::regclass)), '%(profile_id)%', 'one-open key is profile_id');
select has_index('public','time_entries','time_entries_start_key_unique', 'retry key unique index exists');
select alike((select pg_get_constraintdef(oid) from pg_constraint where conrelid='public.time_entries'::regclass and conname='time_entries_no_overlap'), '%tstzrange(started_at, ended_at, ''[)''::text)%', 'overlap constraint uses half-open unbounded ranges');
select ok(not exists(select from pg_constraint where conrelid='public.time_entries'::regclass and confrelid='public.profiles'::regclass and confdeltype<>'r'), 'all time profile FKs restrict deletion');
select ok(not exists(select from information_schema.columns where table_schema='public' and table_name='time_entries' and data_type='timestamp with time zone' and datetime_precision<>3), 'all stored instants have millisecond precision');
select is((select pronargs from pg_proc where oid='public.clock_in(uuid)'::regprocedure), 1::smallint, 'Start accepts only key');
select is((select pronargs from pg_proc where oid='public.clock_out(uuid)'::regprocedure), 1::smallint, 'Stop accepts only entry id');
select is((select provolatile::text from pg_proc where oid='public.planning_daily(date,date)'::regprocedure), 's', 'report is stable');
select ok(not has_table_privilege('anon','public.time_entries','DELETE'), 'anon lacks DELETE');
select ok(not has_table_privilege('anon','public.time_entries','TRUNCATE'), 'anon lacks TRUNCATE');
select ok(not has_table_privilege('authenticated','public.time_entries','DELETE'), 'authenticated lacks DELETE');
select ok(not has_table_privilege('authenticated','public.time_entries','TRUNCATE'), 'authenticated lacks TRUNCATE');
select ok(not has_table_privilege('service_role','public.time_entries','DELETE'), 'service_role lacks DELETE');
select ok(not has_table_privilege('service_role','public.time_entries','TRUNCATE'), 'service_role lacks TRUNCATE');
select is((select prosecdef from pg_proc where oid='public.time_entries_guard()'::regprocedure), true, 'time_entries_guard() security mode');
select ok((select proconfig @> array['search_path=""'] from pg_proc where oid='public.time_entries_guard()'::regprocedure), 'time_entries_guard() pins search path');
select ok(not has_function_privilege('anon','public.time_entries_guard()','EXECUTE'), 'anon cannot execute time_entries_guard()');
select is(has_function_privilege('authenticated','public.time_entries_guard()','EXECUTE'), false, 'authenticated execute contract time_entries_guard()');
select ok(not exists(select from pg_proc p, lateral aclexplode(p.proacl) a where p.oid='public.time_entries_guard()'::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE'), 'PUBLIC lacks execute time_entries_guard()');
select is((select prosecdef from pg_proc where oid='public.clock_in(uuid)'::regprocedure), true, 'clock_in(uuid) security mode');
select ok((select proconfig @> array['search_path=""'] from pg_proc where oid='public.clock_in(uuid)'::regprocedure), 'clock_in(uuid) pins search path');
select ok(not has_function_privilege('anon','public.clock_in(uuid)','EXECUTE'), 'anon cannot execute clock_in(uuid)');
select is(has_function_privilege('authenticated','public.clock_in(uuid)','EXECUTE'), true, 'authenticated execute contract clock_in(uuid)');
select ok(not exists(select from pg_proc p, lateral aclexplode(p.proacl) a where p.oid='public.clock_in(uuid)'::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE'), 'PUBLIC lacks execute clock_in(uuid)');
select is((select prosecdef from pg_proc where oid='public.clock_out(uuid)'::regprocedure), true, 'clock_out(uuid) security mode');
select ok((select proconfig @> array['search_path=""'] from pg_proc where oid='public.clock_out(uuid)'::regprocedure), 'clock_out(uuid) pins search path');
select ok(not has_function_privilege('anon','public.clock_out(uuid)','EXECUTE'), 'anon cannot execute clock_out(uuid)');
select is(has_function_privilege('authenticated','public.clock_out(uuid)','EXECUTE'), true, 'authenticated execute contract clock_out(uuid)');
select ok(not exists(select from pg_proc p, lateral aclexplode(p.proacl) a where p.oid='public.clock_out(uuid)'::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE'), 'PUBLIC lacks execute clock_out(uuid)');
select is((select prosecdef from pg_proc where oid='public.correct_time_entry(uuid,timestamptz,timestamptz,text,bigint,boolean)'::regprocedure), true, 'correct_time_entry(uuid,timestamptz,timestamptz,text,bigint,boolean) security mode');
select ok((select proconfig @> array['search_path=""'] from pg_proc where oid='public.correct_time_entry(uuid,timestamptz,timestamptz,text,bigint,boolean)'::regprocedure), 'correct_time_entry(uuid,timestamptz,timestamptz,text,bigint,boolean) pins search path');
select ok(not has_function_privilege('anon','public.correct_time_entry(uuid,timestamptz,timestamptz,text,bigint,boolean)','EXECUTE'), 'anon cannot execute correct_time_entry(uuid,timestamptz,timestamptz,text,bigint,boolean)');
select is(has_function_privilege('authenticated','public.correct_time_entry(uuid,timestamptz,timestamptz,text,bigint,boolean)','EXECUTE'), true, 'authenticated execute contract correct_time_entry(uuid,timestamptz,timestamptz,text,bigint,boolean)');
select ok(not exists(select from pg_proc p, lateral aclexplode(p.proacl) a where p.oid='public.correct_time_entry(uuid,timestamptz,timestamptz,text,bigint,boolean)'::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE'), 'PUBLIC lacks execute correct_time_entry(uuid,timestamptz,timestamptz,text,bigint,boolean)');
select is((select prosecdef from pg_proc where oid='public.planning_daily(date,date)'::regprocedure), false, 'planning_daily(date,date) security mode');
select ok((select proconfig @> array['search_path=""'] from pg_proc where oid='public.planning_daily(date,date)'::regprocedure), 'planning_daily(date,date) pins search path');
select ok(not has_function_privilege('anon','public.planning_daily(date,date)','EXECUTE'), 'anon cannot execute planning_daily(date,date)');
select is(has_function_privilege('authenticated','public.planning_daily(date,date)','EXECUTE'), true, 'authenticated execute contract planning_daily(date,date)');
select ok(not exists(select from pg_proc p, lateral aclexplode(p.proacl) a where p.oid='public.planning_daily(date,date)'::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE'), 'PUBLIC lacks execute planning_daily(date,date)');

select tests.login_as_user(:'owner_id');
select throws_ok('delete from public.time_entries', '42501', null, 'owner delete denied by ACL');
select tests.logout();
select throws_ok('delete from public.time_entries', 'P0001', 'PLANNING_NO_DELETE', 'postgres delete blocked unconditionally');
select throws_ok(format('delete from public.profiles where id=%L', :'person_missing'), '23503', null, 'time history restricts profile deletion without rate/shift references');
select throws_ok(format('delete from auth.users where id=%L', :'person_missing'), '23503', null, 'auth cascading profile deletion cannot erase time history');

-- Rollback-only broad grants/policies prove the guard is an independent boundary.
grant insert,update,delete on public.time_entries to authenticated;
create policy test_time_all on public.time_entries for all to authenticated using(true) with check(true);
select tests.login_as_user(:'owner_id');
select throws_ok('delete from public.time_entries', 'P0001', 'PLANNING_NO_DELETE', 'owner temporary DELETE grant still blocked');
select throws_ok(format('update public.time_entries set profile_id=%L where id=%L', :'seller_b', :'entry_picker_a'), 'P0001', 'PLANNING_IMMUTABLE', 'owner cannot change entry person');
select throws_ok(format('update public.time_entries set id=gen_random_uuid() where id=%L', :'entry_picker_a'), 'P0001', 'PLANNING_IMMUTABLE', 'owner cannot change id');
select throws_ok(format('update public.time_entries set start_key=gen_random_uuid() where id=%L', :'entry_picker_a'), 'P0001', 'PLANNING_IMMUTABLE', 'owner cannot change start_key');
select throws_ok(format('update public.time_entries set shift_id=null where id=%L', :'entry_picker_a'), 'P0001', 'PLANNING_IMMUTABLE', 'owner cannot change shift_id');
select throws_ok(format('update public.time_entries set created_at=now()-interval ''1 day'' where id=%L', :'entry_picker_a'), 'P0001', 'PLANNING_IMMUTABLE', 'owner cannot change created_at');
select throws_ok(format('update public.time_entries set hourly_rate_ore=123,correction_reason=%L where id=%L', 'Arbitrary reprice', :'entry_picker_a'), 'P0001', 'TIME_RATE', 'guard rejects arbitrary existing snapshot repricing');

select tests.login_as('picker') as guard_picker \gset
select (public.clock_in(gen_random_uuid())).id as guard_entry_picker \gset
select throws_ok(format('update public.time_entries set ended_at=now(),started_at=now()-interval ''1 hour'' where id=%L', :'guard_entry_picker'), 'P0001', 'PLANNING_IMMUTABLE', 'picker cannot disguise started_at edit as Stop');
select throws_ok(format('update public.time_entries set ended_at=now(),hourly_rate_ore=123 where id=%L', :'guard_entry_picker'), 'P0001', 'PLANNING_IMMUTABLE', 'picker cannot disguise hourly_rate_ore edit as Stop');
select throws_ok(format('update public.time_entries set ended_at=now(),profile_id=%L where id=%L', :'owner_id', :'guard_entry_picker'), 'P0001', 'PLANNING_IMMUTABLE', 'picker cannot disguise profile_id edit as Stop');
select throws_ok(format('update public.time_entries set ended_at=now(),shift_id=%L where id=%L', :'unlinked_shift', :'guard_entry_picker'), 'P0001', 'PLANNING_IMMUTABLE', 'picker cannot disguise shift_id edit as Stop');
select throws_ok(format('update public.time_entries set ended_at=now(),start_key=gen_random_uuid() where id=%L', :'guard_entry_picker'), 'P0001', 'PLANNING_IMMUTABLE', 'picker cannot disguise start_key edit as Stop');
select throws_ok(format('update public.time_entries set ended_at=now(),id=gen_random_uuid() where id=%L', :'guard_entry_picker'), 'P0001', 'PLANNING_IMMUTABLE', 'picker cannot disguise id edit as Stop');
select throws_ok(format('update public.time_entries set ended_at=now(),created_at=now()-interval ''1 hour'' where id=%L', :'guard_entry_picker'), 'P0001', 'PLANNING_IMMUTABLE', 'picker cannot disguise created_at edit as Stop');
select throws_ok(format('update public.time_entries set ended_at=now(),correction_reason=''Forged correction'' where id=%L', :'guard_entry_picker'), 'P0001', 'PLANNING_IMMUTABLE', 'picker cannot disguise correction_reason edit as Stop');
select throws_ok(format('update public.time_entries set ended_at=now(),corrected_by=%L where id=%L', :'owner_id', :'guard_entry_picker'), 'P0001', 'PLANNING_IMMUTABLE', 'picker cannot disguise corrected_by edit as Stop');
select throws_ok(format('update public.time_entries set ended_at=now(),corrected_at=now() where id=%L', :'guard_entry_picker'), 'P0001', 'PLANNING_IMMUTABLE', 'picker cannot disguise corrected_at edit as Stop');
select throws_ok('insert into public.time_entries(profile_id,start_key) values(auth.uid(),gen_random_uuid())', '23505', null, 'picker one-open unique constraint holds with permissive grant');
select throws_ok(format('select public.clock_out(%L)', :'entry_picker_a'), 'P0001', 'PLANNING_NOT_FOUND', 'picker RPC rejects hidden id despite permissive policy');
select is((select version from public.time_entries where id=:'guard_entry_picker'), 1::bigint, 'picker failed payloads preserve version');
select lives_ok(format('update public.time_entries set ended_at=date_trunc(%L,now()),version=99,updated_at=%L where id=%L', 'milliseconds','2000-01-01Z',:'guard_entry_picker'), 'picker legitimate stop server-overwrites version/update metadata');
select is((select version from public.time_entries where id=:'guard_entry_picker'), 2::bigint, 'picker server version cannot be spoofed');
select is((select updated_at from public.time_entries where id=:'guard_entry_picker'), :'db_now'::timestamptz, 'picker update time is DB time');
select throws_ok(format('insert into public.time_entries(profile_id,start_key) values(auth.uid(),(select start_key from public.time_entries where id=%L))', :'guard_entry_picker'), '23505', null, 'picker start-key unique constraint holds after close');

select tests.login_as('seller') as guard_seller \gset
select (public.clock_in(gen_random_uuid())).id as guard_entry_seller \gset
select throws_ok(format('update public.time_entries set ended_at=now(),started_at=now()-interval ''1 hour'' where id=%L', :'guard_entry_seller'), 'P0001', 'PLANNING_IMMUTABLE', 'seller cannot disguise started_at edit as Stop');
select throws_ok(format('update public.time_entries set ended_at=now(),hourly_rate_ore=123 where id=%L', :'guard_entry_seller'), 'P0001', 'PLANNING_IMMUTABLE', 'seller cannot disguise hourly_rate_ore edit as Stop');
select throws_ok(format('update public.time_entries set ended_at=now(),profile_id=%L where id=%L', :'owner_id', :'guard_entry_seller'), 'P0001', 'PLANNING_IMMUTABLE', 'seller cannot disguise profile_id edit as Stop');
select throws_ok(format('update public.time_entries set ended_at=now(),shift_id=%L where id=%L', :'unlinked_shift', :'guard_entry_seller'), 'P0001', 'PLANNING_IMMUTABLE', 'seller cannot disguise shift_id edit as Stop');
select throws_ok(format('update public.time_entries set ended_at=now(),start_key=gen_random_uuid() where id=%L', :'guard_entry_seller'), 'P0001', 'PLANNING_IMMUTABLE', 'seller cannot disguise start_key edit as Stop');
select throws_ok(format('update public.time_entries set ended_at=now(),id=gen_random_uuid() where id=%L', :'guard_entry_seller'), 'P0001', 'PLANNING_IMMUTABLE', 'seller cannot disguise id edit as Stop');
select throws_ok(format('update public.time_entries set ended_at=now(),created_at=now()-interval ''1 hour'' where id=%L', :'guard_entry_seller'), 'P0001', 'PLANNING_IMMUTABLE', 'seller cannot disguise created_at edit as Stop');
select throws_ok(format('update public.time_entries set ended_at=now(),correction_reason=''Forged correction'' where id=%L', :'guard_entry_seller'), 'P0001', 'PLANNING_IMMUTABLE', 'seller cannot disguise correction_reason edit as Stop');
select throws_ok(format('update public.time_entries set ended_at=now(),corrected_by=%L where id=%L', :'owner_id', :'guard_entry_seller'), 'P0001', 'PLANNING_IMMUTABLE', 'seller cannot disguise corrected_by edit as Stop');
select throws_ok(format('update public.time_entries set ended_at=now(),corrected_at=now() where id=%L', :'guard_entry_seller'), 'P0001', 'PLANNING_IMMUTABLE', 'seller cannot disguise corrected_at edit as Stop');
select throws_ok('insert into public.time_entries(profile_id,start_key) values(auth.uid(),gen_random_uuid())', '23505', null, 'seller one-open unique constraint holds with permissive grant');
select throws_ok(format('select public.clock_out(%L)', :'entry_picker_a'), 'P0001', 'PLANNING_NOT_FOUND', 'seller RPC rejects hidden id despite permissive policy');
select is((select version from public.time_entries where id=:'guard_entry_seller'), 1::bigint, 'seller failed payloads preserve version');
select lives_ok(format('update public.time_entries set ended_at=date_trunc(%L,now()),version=99,updated_at=%L where id=%L', 'milliseconds','2000-01-01Z',:'guard_entry_seller'), 'seller legitimate stop server-overwrites version/update metadata');
select is((select version from public.time_entries where id=:'guard_entry_seller'), 2::bigint, 'seller server version cannot be spoofed');
select is((select updated_at from public.time_entries where id=:'guard_entry_seller'), :'db_now'::timestamptz, 'seller update time is DB time');
select throws_ok(format('insert into public.time_entries(profile_id,start_key) values(auth.uid(),(select start_key from public.time_entries where id=%L))', :'guard_entry_seller'), '23505', null, 'seller start-key unique constraint holds after close');

select tests.login_as_user(:'guard_picker');
select throws_ok(format('insert into public.time_entries(profile_id,start_key) values(%L,gen_random_uuid())', :'owner_id'), '42501', null, 'insert guard rejects different person');
insert into public.time_entries(profile_id,start_key,started_at,ended_at,hourly_rate_ore,shift_id,version,created_at,updated_at,correction_reason,corrected_at,corrected_by)
values(auth.uid(),gen_random_uuid(),'2000-01-01Z','2000-01-02Z',999,:'unlinked_shift',88,'2000-01-01Z','2000-01-01Z','Forged',now(),:'owner_id') returning id as derived_entry \gset
select results_eq(format('select started_at,ended_at,hourly_rate_ore,shift_id,version,created_at,updated_at,correction_reason,corrected_at,corrected_by from public.time_entries where id=%L', :'derived_entry'), $$select date_trunc('milliseconds',now()),null::timestamptz,null::integer,null::uuid,1::bigint,date_trunc('milliseconds',now()),date_trunc('milliseconds',now()),null::text,null::timestamptz,null::uuid$$, 'insert ignores forged derived fields and snapshots missing rate');
select throws_ok(format('update public.time_entries set hourly_rate_ore=123,ended_at=now() where id=%L', :'derived_entry'), 'P0001', 'PLANNING_IMMUTABLE', 'worker cannot fill missing rate');
select tests.login_as_user(:'owner_id');
select throws_ok(format('update public.time_entries set hourly_rate_ore=123,correction_reason=%L where id=%L', 'Fill arbitrary', :'derived_entry'), 'P0001', 'TIME_RATE', 'owner cannot fill arbitrary missing rate under direct grant');
insert into public.work_rates(profile_id,hourly_rate_ore) values(:'guard_picker',30000);
select throws_ok(format('update public.time_entries set hourly_rate_ore=123,correction_reason=%L where id=%L', 'Wrong current rate', :'derived_entry'), 'P0001', 'TIME_RATE', 'guard requires exact current rate for missing fill');
select tests.correct(:'derived_entry', :'db_now', null, 'Fill correctly', true);
select is((select hourly_rate_ore from public.time_entries where id=:'derived_entry'),30000,'guard permits only exact missing-to-current fill');
select throws_ok(format('select tests.correct(%L, %L, null, %L)', :'derived_entry', :'db_now', ' '), 'P0001', 'TIME_REASON', 'old reason cannot substitute for a fresh valid RPC argument');
select lives_ok(format('select tests.correct(%L, %L, null, %L)', :'derived_entry', :'db_now', 'Fill correctly'), 'same valid reason may be explicitly supplied again');
select is((select version from public.time_entries where id=:'derived_entry'), 3::bigint, 'explicit correction increments version even with same reason and timestamps');
select is((select count(*) from public.audit_log where row_id=:'derived_entry' and action='UPDATE'), 2::bigint, 'explicit corrections retain audit even with same reason');
update public.time_entries set correction_reason='Server metadata',corrected_at='2000-01-01Z',
  corrected_by=:'guard_picker',updated_at='2000-01-01Z',version=99 where id=:'derived_entry';
select is((select corrected_at from public.time_entries where id=:'derived_entry'), :'db_now'::timestamptz, 'owner cannot forge correction timestamp');
select is((select corrected_by from public.time_entries where id=:'derived_entry'), :'owner_id'::uuid, 'owner cannot forge correction actor');
select is((select version from public.time_entries where id=:'derived_entry'), 4::bigint, 'owner cannot forge correction version');
select tests.login_as_user(:'inactive');
select throws_ok('insert into public.time_entries(profile_id,start_key) values(auth.uid(),gen_random_uuid())', '42501', null, 'inactive insert guard fails closed');
select throws_ok('update public.time_entries set ended_at=now()', '42501', null, 'inactive update guard fails closed');
select tests.logout();
select throws_ok('insert into public.time_entries(profile_id,start_key) values(null,gen_random_uuid())', '42501', null, 'null identity insert guard fails closed');
select throws_ok('update public.time_entries set ended_at=now()', '42501', null, 'null identity update guard fails closed');
select throws_ok('select public.clock_in(gen_random_uuid())', '42501', null, 'null identity Start fails closed even as postgres');
select * from finish();
rollback;
