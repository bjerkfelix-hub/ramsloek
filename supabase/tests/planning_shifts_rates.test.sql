begin;
create extension if not exists pgtap with schema extensions;
\ir helpers.psql
select no_plan();

-- Invoker-only fixture helpers exercise production guards and RLS.
create function tests.shift(p_person uuid, p_start timestamp default '2027-03-15 08:00',
  p_end timestamp default '2027-03-15 12:00', p jsonb default '{}') returns uuid
language sql as $$
  insert into public.work_shifts (id, profile_id, starts_at, ends_at, kind, note,
    created_by, created_at, updated_at, shift_date, cancelled_at, cancelled_by,
    cancel_reason, copied_from_shift_id, copied_week)
  values (coalesce((p->>'id')::uuid, gen_random_uuid()), p_person,
    p_start at time zone 'Europe/Oslo', p_end at time zone 'Europe/Oslo',
    coalesce(p->>'kind', 'harvest'), p->>'note',
    coalesce((p->>'created_by')::uuid, auth.uid()),
    coalesce((p->>'created_at')::timestamptz, now()),
    coalesce((p->>'updated_at')::timestamptz, now()),
    coalesce((p->>'shift_date')::date, '2000-01-01'),
    (p->>'cancelled_at')::timestamptz, (p->>'cancelled_by')::uuid, p->>'cancel_reason',
    (p->>'copied_from_shift_id')::uuid, (p->>'copied_week')::date)
  returning id
$$;
grant execute on function tests.shift(uuid, timestamp, timestamp, jsonb) to authenticated;

select tests.login_as('picker') as picker_a \gset
select tests.login_as('picker') as picker_b \gset
select tests.login_as('seller') as seller_a \gset
select tests.login_as('seller') as seller_b \gset
select tests.login_as('picker') as inactive \gset
select tests.login_as('owner') as owner_id \gset
update public.profiles set active = false where id = :'inactive';

-- Each active role can be assigned; rates remain separate from public profiles.
select tests.shift(:'picker_a') as shift_a \gset
select tests.shift(:'picker_b') as shift_b \gset
select tests.shift(:'seller_a') as shift_c \gset
select tests.shift(:'seller_b') as shift_d \gset
select tests.shift(:'owner_id') as shift_owner \gset
select is((select count(*) from public.work_shifts), 5::bigint, 'owner assigns every active role');
select throws_ok(format('select tests.shift(%L)', :'inactive'), 'P0001', 'PLANNING_INACTIVE_PERSON', 'inactive assignment rejected');
insert into public.work_rates (profile_id, hourly_rate_ore) values
  (:'picker_a', 25000), (:'picker_b', 30000), (:'seller_a', 25000), (:'seller_b', 30000), (:'owner_id', 0), (:'inactive', 25000);
select is((select count(*) from public.work_rates), 6::bigint, 'owner reads all rates including inactive history');
select is((select hourly_rate_ore from public.work_rates where profile_id = auth.uid()), 0, 'explicit own zero rate accepted');
select ok(not exists (select from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name like '%rate%'), 'profiles have no rate column');

select throws_ok(format($$select tests.shift(%L, '2027-03-15 08:00', '2027-03-15 12:00', %L)$$, :'picker_a', '{"kind":"invalid"}'), '23514', null, 'unknown kind rejected');
select throws_ok(format($$select tests.shift(%L, '2027-03-15 08:00', '2027-03-15 12:00', %L)$$, :'picker_a', jsonb_build_object('note', repeat('x', 2001))), '23514', null, 'note over 2000 rejected');
select throws_ok(format('select tests.shift(%L, %L, %L)', :'picker_a', '2027-03-16 12:00', '2027-03-16 08:00'), 'P0001', 'SHIFT_INTERVAL', 'inverted interval rejected');
select throws_ok(format('select tests.shift(%L, %L, %L)', :'picker_a', '2027-03-16 08:00', '2027-03-16 08:00'), 'P0001', 'SHIFT_INTERVAL', 'zero interval rejected');
select throws_ok(format('select tests.shift(%L, %L, %L)', :'picker_a', '2027-03-16 08:00', '2027-03-17 11:00'), 'P0001', 'SHIFT_INTERVAL', '27 hour interval rejected');
select throws_ok(format('select tests.shift(%L, %L, %L)', :'picker_a', '2027-03-16 23:30', '2027-03-18 00:30'), 'P0001', 'SHIFT_INTERVAL', 'two local dates later rejected even within 26 hours');
select lives_ok(format('select tests.shift(%L, %L, %L)', :'picker_a', '2027-03-16 08:00', '2027-03-17 10:00'), '26 hour next day interval accepted');
select lives_ok(format('select tests.shift(%L, %L, %L)', :'picker_a', '2027-10-31 00:00', '2027-11-01 00:00'), '25 hour autumn day accepted');
select throws_ok(format('select tests.shift(%L, %L, %L)', :'picker_a', 'infinity', 'infinity'), 'P0001', 'SHIFT_INTERVAL', 'infinite shift rejected');
select lives_ok(format('select tests.shift(%L, %L, %L)', :'picker_a', '2027-03-15 12:00', '2027-03-15 14:00'), 'adjacent shifts allowed');
select throws_ok(format('select tests.shift(%L, %L, %L)', :'picker_a', '2027-03-15 11:00', '2027-03-15 13:00'), '23P01', null, 'overlapping shifts rejected');
select is((select conname::text from pg_constraint where conrelid = 'public.work_shifts'::regclass and contype = 'x'), 'work_shifts_no_overlap', 'exclusion constraint is named');
select has_index('public', 'work_shifts', 'work_shifts_copy_unique', 'copy uniqueness index exists');
select has_index('public', 'work_rates', 'work_rates_profile_unique', 'rate profile uniqueness index exists');

-- Server metadata and immutable fields.
select throws_ok(format('select tests.shift(%L, %L, %L, %L)', :'owner_id', '2027-03-16 08:00', '2027-03-16 09:00', jsonb_build_object('created_by', :'picker_a')), '42501', null, 'forged creator rejected');
select tests.shift(:'owner_id', '2027-03-17 08:00', '2027-03-17 09:00', '{"created_at":"2000-01-01Z","updated_at":"2000-01-01Z"}') as metadata_shift \gset
select is((select created_at from public.work_shifts where id = :'metadata_shift'), date_trunc('milliseconds', now()), 'shift creation time from DB');
select is((select updated_at from public.work_shifts where id = :'metadata_shift'), date_trunc('milliseconds', now()), 'shift update time from DB');
select is((select shift_date from public.work_shifts where id = :'metadata_shift'), '2027-03-17'::date, 'shift date derived from Oslo start');
select throws_ok(format('update public.work_shifts set id = gen_random_uuid() where id = %L', :'shift_a'), 'P0001', 'PLANNING_IMMUTABLE', 'shift id immutable');
select throws_ok(format('update public.work_shifts set created_by = %L where id = %L', :'picker_a', :'shift_a'), 'P0001', 'PLANNING_IMMUTABLE', 'shift creator immutable');
select throws_ok(format('update public.work_shifts set created_at = now() - interval %L where id = %L', '1 day', :'shift_a'), 'P0001', 'PLANNING_IMMUTABLE', 'shift creation time immutable');
select throws_ok(format('update public.work_shifts set copied_from_shift_id = %L, copied_week = %L where id = %L', :'shift_b', '2027-03-22', :'shift_a'), 'P0001', 'PLANNING_IMMUTABLE', 'shift provenance immutable');
select throws_ok(format('select public.cancel_work_shift(%L, %L)', :'shift_a', ' a '), 'P0001', 'SHIFT_CANCEL_REASON', 'trimmed short cancellation reason rejected');
select throws_ok(format('select public.cancel_work_shift(%L, %L)', :'shift_a', repeat('x', 501)), 'P0001', 'SHIFT_CANCEL_REASON', 'reason over 500 rejected');
select lives_ok(format('select public.cancel_work_shift(%L, %L)', :'shift_a', ' Feil vakt '), 'cancellation accepted');
select is((select cancel_reason from public.work_shifts where id = :'shift_a'), 'Feil vakt', 'cancellation reason trimmed');
select is((select cancelled_by from public.work_shifts where id = :'shift_a'), :'owner_id'::uuid, 'cancellation actor is caller');
select is((select cancelled_at from public.work_shifts where id = :'shift_a'), date_trunc('milliseconds', now()), 'cancellation time from DB');
select throws_ok(format('update public.work_shifts set cancelled_at = null, cancelled_by = null, cancel_reason = null where id = %L', :'shift_a'), 'P0001', 'SHIFT_CANCELLED', 'cannot restore cancelled shift');
select throws_ok(format('update public.work_shifts set note = %L where id = %L', 'changed', :'shift_a'), 'P0001', 'SHIFT_CANCELLED', 'cannot edit cancelled shift');
select lives_ok(format('select tests.shift(%L)', :'picker_a'), 'cancelled range allows replacement');
select throws_ok($$select public.cancel_work_shift('00000000-0000-0000-0000-000000000099', 'Feil vakt')$$, 'P0001', 'PLANNING_NOT_FOUND', 'missing cancellation id has safe error');

select throws_ok(format('update public.work_rates set hourly_rate_ore = -1 where profile_id = %L', :'picker_a'), 'P0001', 'RATE_INVALID', 'negative rate rejected by guard');
select throws_ok(format('update public.work_rates set hourly_rate_ore = 1000001 where profile_id = %L', :'picker_a'), 'P0001', 'RATE_INVALID', 'rate above maximum rejected by guard');
select lives_ok(format('update public.work_rates set hourly_rate_ore = 1000000 where profile_id = %L', :'owner_id'), 'maximum rate accepted');
select throws_ok(format('update public.work_rates set id = gen_random_uuid() where profile_id = %L', :'picker_a'), 'P0001', 'PLANNING_IMMUTABLE', 'rate id immutable');
select throws_ok(format('update public.work_rates set profile_id = %L where profile_id = %L', :'picker_b', :'picker_a'), 'P0001', 'PLANNING_IMMUTABLE', 'rate person immutable');
select throws_ok(format('update public.work_rates set created_at = now() - interval %L where profile_id = %L', '1 day', :'picker_a'), 'P0001', 'PLANNING_IMMUTABLE', 'rate creation time immutable');
update public.work_rates set hourly_rate_ore = 30000, updated_by = :'picker_a', updated_at = '2000-01-01Z' where profile_id = :'picker_a';
select is((select updated_by from public.work_rates where profile_id = :'picker_a'), :'owner_id'::uuid, 'rate actor cannot be spoofed');
select is((select updated_at from public.work_rates where profile_id = :'picker_a'), date_trunc('milliseconds', now()), 'rate update time cannot be spoofed');
select is((select created_at from public.work_rates where profile_id = :'picker_a'), date_trunc('milliseconds', now()), 'rate creation time from DB');
select is((select data->'old'->>'hourly_rate_ore' from public.audit_log where table_name = 'work_rates' and action = 'UPDATE' and data->'new'->>'profile_id' = :'picker_a' order by id desc limit 1), '25000', 'audit preserves old rate');
select is((select data->'new'->>'hourly_rate_ore' from public.audit_log where table_name = 'work_rates' and action = 'UPDATE' and data->'new'->>'profile_id' = :'picker_a' order by id desc limit 1), '30000', 'audit preserves new rate');
select is((select actor from public.audit_log where table_name = 'work_rates' and action = 'UPDATE' and data->'new'->>'profile_id' = :'picker_a' order by id desc limit 1), :'owner_id'::uuid, 'rate audit actor');
select is((select data->'new'->>'hourly_rate_ore' from public.audit_log where table_name = 'work_rates' and action = 'INSERT' and data->'new'->>'profile_id' = :'picker_a'), '25000', 'rate insert audit wraps new');
update public.work_shifts set note = 'Edited note' where id = :'shift_b';
select is((select data->'old'->>'note' from public.audit_log where row_id = :'shift_b' and action = 'UPDATE' order by id desc limit 1), null::text, 'shift audit preserves old note');
select is((select data->'new'->>'note' from public.audit_log where row_id = :'shift_b' and action = 'UPDATE' order by id desc limit 1), 'Edited note', 'shift audit preserves new note');
select is((select actor from public.audit_log where row_id = :'shift_b' and action = 'UPDATE' order by id desc limit 1), :'owner_id'::uuid, 'shift audit actor');
select is((select data->'new'->>'kind' from public.audit_log where row_id = :'shift_b' and action = 'INSERT'), 'harvest', 'shift insert audit wraps new');

select tests.login_as_user(:'picker_a');
select is((select count(*) from public.work_rates), 1::bigint, 'picker_a reads own rate only');
select is((select count(*) from public.work_rates where profile_id <> auth.uid()), 0::bigint, 'picker_a cannot read same-role or cross-role rates');
select is((select count(*) from public.work_shifts where profile_id <> auth.uid()), 0::bigint, 'picker_a cannot read same-role or cross-role shifts');
select ok(exists(select from public.work_shifts where profile_id = auth.uid()), 'picker_a reads own shifts');
select throws_ok($$insert into public.work_rates (profile_id, hourly_rate_ore) values (auth.uid(), 1)$$, '42501', null, 'picker_a rate insert denied');
select throws_ok($$select tests.shift(auth.uid())$$, '42501', null, 'picker_a shift insert denied');
with changed as (update public.work_rates set hourly_rate_ore = 1 returning *) select is((select count(*) from changed), 0::bigint, 'picker_a rate update affects zero rows');
with changed as (update public.work_shifts set note = 'forged' returning *) select is((select count(*) from changed), 0::bigint, 'picker_a shift update affects zero rows');
select is((select count(*) from public.profiles p join public.work_rates r on r.profile_id = p.id where p.id <> auth.uid()), 0::bigint, 'picker_a profile join cannot reveal other rates');
select is((select count(*) from public.profiles p join public.work_shifts s on s.profile_id = p.id where p.id <> auth.uid()), 0::bigint, 'picker_a profile join cannot reveal other shifts');
select is((select count(*) from public.audit_log), 0::bigint, 'picker_a cannot read audit log');
select throws_ok($$select public.copy_work_week('2027-03-22')$$, '42501', null, 'picker_a copy denied');
select throws_ok(format('select public.cancel_work_shift(%L, %L)', :'shift_b', 'Feil vakt'), '42501', null, 'picker_a cancellation denied before lookup');

select tests.login_as_user(:'picker_b');
select is((select count(*) from public.work_rates), 1::bigint, 'picker_b reads own rate only');
select is((select count(*) from public.work_rates where profile_id <> auth.uid()), 0::bigint, 'picker_b cannot read same-role or cross-role rates');
select is((select count(*) from public.work_shifts where profile_id <> auth.uid()), 0::bigint, 'picker_b cannot read same-role or cross-role shifts');
select ok(exists(select from public.work_shifts where profile_id = auth.uid()), 'picker_b reads own shifts');
select throws_ok($$insert into public.work_rates (profile_id, hourly_rate_ore) values (auth.uid(), 1)$$, '42501', null, 'picker_b rate insert denied');
select throws_ok($$select tests.shift(auth.uid())$$, '42501', null, 'picker_b shift insert denied');
with changed as (update public.work_rates set hourly_rate_ore = 1 returning *) select is((select count(*) from changed), 0::bigint, 'picker_b rate update affects zero rows');
with changed as (update public.work_shifts set note = 'forged' returning *) select is((select count(*) from changed), 0::bigint, 'picker_b shift update affects zero rows');
select is((select count(*) from public.profiles p join public.work_rates r on r.profile_id = p.id where p.id <> auth.uid()), 0::bigint, 'picker_b profile join cannot reveal other rates');
select is((select count(*) from public.profiles p join public.work_shifts s on s.profile_id = p.id where p.id <> auth.uid()), 0::bigint, 'picker_b profile join cannot reveal other shifts');
select is((select count(*) from public.audit_log), 0::bigint, 'picker_b cannot read audit log');
select throws_ok($$select public.copy_work_week('2027-03-22')$$, '42501', null, 'picker_b copy denied');
select throws_ok(format('select public.cancel_work_shift(%L, %L)', :'shift_b', 'Feil vakt'), '42501', null, 'picker_b cancellation denied before lookup');

select tests.login_as_user(:'seller_a');
select is((select count(*) from public.work_rates), 1::bigint, 'seller_a reads own rate only');
select is((select count(*) from public.work_rates where profile_id <> auth.uid()), 0::bigint, 'seller_a cannot read same-role or cross-role rates');
select is((select count(*) from public.work_shifts where profile_id <> auth.uid()), 0::bigint, 'seller_a cannot read same-role or cross-role shifts');
select ok(exists(select from public.work_shifts where profile_id = auth.uid()), 'seller_a reads own shifts');
select throws_ok($$insert into public.work_rates (profile_id, hourly_rate_ore) values (auth.uid(), 1)$$, '42501', null, 'seller_a rate insert denied');
select throws_ok($$select tests.shift(auth.uid())$$, '42501', null, 'seller_a shift insert denied');
with changed as (update public.work_rates set hourly_rate_ore = 1 returning *) select is((select count(*) from changed), 0::bigint, 'seller_a rate update affects zero rows');
with changed as (update public.work_shifts set note = 'forged' returning *) select is((select count(*) from changed), 0::bigint, 'seller_a shift update affects zero rows');
select is((select count(*) from public.profiles p join public.work_rates r on r.profile_id = p.id where p.id <> auth.uid()), 0::bigint, 'seller_a profile join cannot reveal other rates');
select is((select count(*) from public.profiles p join public.work_shifts s on s.profile_id = p.id where p.id <> auth.uid()), 0::bigint, 'seller_a profile join cannot reveal other shifts');
select is((select count(*) from public.audit_log), 0::bigint, 'seller_a cannot read audit log');
select throws_ok($$select public.copy_work_week('2027-03-22')$$, '42501', null, 'seller_a copy denied');
select throws_ok(format('select public.cancel_work_shift(%L, %L)', :'shift_b', 'Feil vakt'), '42501', null, 'seller_a cancellation denied before lookup');

select tests.login_as_user(:'seller_b');
select is((select count(*) from public.work_rates), 1::bigint, 'seller_b reads own rate only');
select is((select count(*) from public.work_rates where profile_id <> auth.uid()), 0::bigint, 'seller_b cannot read same-role or cross-role rates');
select is((select count(*) from public.work_shifts where profile_id <> auth.uid()), 0::bigint, 'seller_b cannot read same-role or cross-role shifts');
select ok(exists(select from public.work_shifts where profile_id = auth.uid()), 'seller_b reads own shifts');
select throws_ok($$insert into public.work_rates (profile_id, hourly_rate_ore) values (auth.uid(), 1)$$, '42501', null, 'seller_b rate insert denied');
select throws_ok($$select tests.shift(auth.uid())$$, '42501', null, 'seller_b shift insert denied');
with changed as (update public.work_rates set hourly_rate_ore = 1 returning *) select is((select count(*) from changed), 0::bigint, 'seller_b rate update affects zero rows');
with changed as (update public.work_shifts set note = 'forged' returning *) select is((select count(*) from changed), 0::bigint, 'seller_b shift update affects zero rows');
select is((select count(*) from public.profiles p join public.work_rates r on r.profile_id = p.id where p.id <> auth.uid()), 0::bigint, 'seller_b profile join cannot reveal other rates');
select is((select count(*) from public.profiles p join public.work_shifts s on s.profile_id = p.id where p.id <> auth.uid()), 0::bigint, 'seller_b profile join cannot reveal other shifts');
select is((select count(*) from public.audit_log), 0::bigint, 'seller_b cannot read audit log');
select throws_ok($$select public.copy_work_week('2027-03-22')$$, '42501', null, 'seller_b copy denied');
select throws_ok(format('select public.cancel_work_shift(%L, %L)', :'shift_b', 'Feil vakt'), '42501', null, 'seller_b cancellation denied before lookup');

select tests.login_as_user(:'picker_a');
select is((select count(*) from public.work_shifts where id = :'shift_a' and cancelled_at is not null), 1::bigint, 'worker sees own cancelled shift');
select tests.login_as_user(:'owner_id');
select is((select hourly_rate_ore from public.work_rates where profile_id = :'picker_a'), 30000, 'worker writes left rates unchanged');
select is((select note from public.work_shifts where id = :'shift_b'), 'Edited note', 'worker writes left shifts unchanged');

-- Calendar copy over spring DST, retry identity, start-date selection and atomic failure.
select tests.shift(:'picker_b', '2027-03-22 08:00', '2027-03-22 12:00', '{"kind":"packing","note":"Copy me"}') as source_a \gset
select tests.shift(:'seller_a', '2027-03-28 23:00', '2027-03-29 01:00') as source_sunday \gset
select tests.shift(:'seller_b', '2027-03-21 23:00', '2027-03-22 01:00') as preceding_sunday \gset
select tests.shift(:'seller_b', '2027-03-23 08:00', '2027-03-23 12:00') as cancelled_source \gset
select public.cancel_work_shift(:'cancelled_source', 'Feil vakt');
select is(public.copy_work_week('2027-03-22'), 2, 'copy includes source Sunday once and excludes preceding Sunday and cancelled source');
select is((select starts_at from public.work_shifts where id = :'source_a'), '2027-03-22 07:00Z'::timestamptz, 'source start UTC before DST');
select is((select starts_at from public.work_shifts where copied_from_shift_id = :'source_a'), '2027-03-29 06:00Z'::timestamptz, 'copy preserves Oslo 08:00 across DST');
select is((select ends_at from public.work_shifts where copied_from_shift_id = :'source_a'), '2027-03-29 10:00Z'::timestamptz, 'copy preserves Oslo end across DST');
select is((select kind || '/' || note from public.work_shifts where copied_from_shift_id = :'source_a'), 'packing/Copy me', 'copy preserves type and note');
select is((select copied_week from public.work_shifts where copied_from_shift_id = :'source_sunday'), '2027-03-29'::date, 'Sunday copy provenance uses target Monday');
select array_agg(id order by id)::text as copied_ids from public.work_shifts where copied_week = '2027-03-29' \gset
select is(public.copy_work_week('2027-03-22'), 0, 'retry inserts zero copies');
select is((select array_agg(id order by id)::text from public.work_shifts where copied_week = '2027-03-29'), :'copied_ids', 'retry preserves ids');
update public.work_shifts set note = 'Edited copy' where copied_from_shift_id = :'source_a';
select public.cancel_work_shift((select id from public.work_shifts where copied_from_shift_id = :'source_sunday'), 'Feil vakt');
select is(public.copy_work_week('2027-03-22'), 0, 'edited and cancelled copies still skipped');
select tests.shift(:'owner_id', '2027-03-24 08:00', '2027-03-24 12:00') as added_source \gset
select is(public.copy_work_week('2027-03-22'), 1, 'later source adds exactly one copy');
select throws_ok($$select public.copy_work_week('2027-03-23')$$, 'P0001', 'PLANNING_WEEK', 'non-Monday rejected');
select throws_ok($$select public.copy_work_week(null)$$, 'P0001', 'PLANNING_WEEK', 'null week rejected');
select throws_ok($$select public.copy_work_week('infinity')$$, 'P0001', 'PLANNING_WEEK', 'infinite week rejected');

select tests.shift(:'picker_b', '2027-05-03 08:00', '2027-05-03 12:00');
select tests.shift(:'seller_b', '2027-05-04 08:00', '2027-05-04 12:00');
select tests.shift(:'seller_b', '2027-05-11 09:00', '2027-05-11 10:00');
select array_agg(id order by id)::text as before_conflict from public.work_shifts \gset
select throws_ok($$select public.copy_work_week('2027-05-03')$$, '23P01', null, 'target overlap rejects whole copy');
select is((select array_agg(id order by id)::text from public.work_shifts), :'before_conflict', 'overlap copy leaves complete id set unchanged');
select tests.shift(:'picker_b', '2027-05-17 08:00', '2027-05-17 12:00');
select tests.shift(:'seller_b', '2027-05-18 08:00', '2027-05-18 12:00') as inactive_shift \gset
update public.profiles set active = false where id = :'seller_b';
select array_agg(id order by id)::text as before_inactive from public.work_shifts \gset
select throws_ok($$select public.copy_work_week('2027-05-17')$$, 'P0001', 'PLANNING_INACTIVE_PERSON', 'inactive assignee rejects whole copy');
select is((select array_agg(id order by id)::text from public.work_shifts), :'before_inactive', 'inactive copy leaves complete id set unchanged');
select throws_ok(format('update public.work_shifts set starts_at = starts_at + interval %L, ends_at = ends_at + interval %L where id = %L', '1 hour', '1 hour', :'inactive_shift'), 'P0001', 'PLANNING_INACTIVE_PERSON', 'cannot change times for inactive person');
select lives_ok(format('update public.work_shifts set note = %L where id = %L', 'Historical note', :'inactive_shift'), 'inactive historical shift note may be edited');
select lives_ok(format('select public.cancel_work_shift(%L, %L)', :'inactive_shift', 'Feil vakt'), 'inactive historical shift may be cancelled');
update public.profiles set active = true where id = :'seller_b';

-- Internal converter is tested as postgres, with no identity bypass in mutation guards.
select tests.logout();
select throws_ok($$select public.planning_oslo_instant('2027-03-28 02:30')$$, 'P0001', 'PLANNING_LOCAL_TIME', 'spring gap rejected');
select throws_ok($$select public.planning_oslo_instant('2027-10-31 02:30')$$, 'P0001', 'PLANNING_LOCAL_TIME', 'autumn ambiguity rejected');
select throws_ok($$select public.planning_oslo_instant(null)$$, 'P0001', 'PLANNING_LOCAL_TIME', 'null local input rejected');
select throws_ok($$select public.planning_oslo_instant('infinity')$$, 'P0001', 'PLANNING_LOCAL_TIME', 'infinite local input rejected');
select is(public.planning_oslo_instant('2027-03-28 08:00'), '2027-03-28 06:00Z'::timestamptz, 'ordinary DST-day input converts exactly');
select throws_ok($$select public.copy_work_week('2027-03-22')$$, '42501', null, 'missing identity cannot copy even as postgres');
select throws_ok($$select public.cancel_work_shift('00000000-0000-0000-0000-000000000099', 'Feil vakt')$$, '42501', null, 'missing identity cannot cancel even as postgres');
select tests.login_as_user(:'owner_id');
select public.cancel_work_shift(id, 'DST fixture') from public.work_shifts where shift_date >= '2027-03-15' and shift_date < '2027-03-22' and cancelled_at is null;
select tests.shift(:'picker_b', '2027-03-21 02:30', '2027-03-21 03:30');
select array_agg(id order by id)::text as before_gap from public.work_shifts \gset
select throws_ok($$select public.copy_work_week('2027-03-15')$$, 'P0001', 'PLANNING_LOCAL_TIME', 'copy landing in spring gap rejected');
select is((select array_agg(id order by id)::text from public.work_shifts), :'before_gap', 'gap copy is atomic');
select tests.shift(:'picker_b', '2027-10-24 02:30', '2027-10-24 03:30');
select array_agg(id order by id)::text as before_fold from public.work_shifts \gset
select throws_ok($$select public.copy_work_week('2027-10-18')$$, 'P0001', 'PLANNING_LOCAL_TIME', 'copy landing in autumn ambiguity rejected');
select is((select array_agg(id order by id)::text from public.work_shifts), :'before_fold', 'ambiguous copy is atomic');

select tests.login_as_user(:'inactive');
select is((select count(*) from public.work_rates), 0::bigint, 'inactive reads no rates');
select is((select count(*) from public.work_shifts), 0::bigint, 'inactive reads no shifts');
select throws_ok($$insert into public.work_rates (profile_id, hourly_rate_ore) values (auth.uid(), 0)$$, '42501', null, 'inactive rate insert denied');
select throws_ok($$select tests.shift(auth.uid())$$, '42501', null, 'inactive shift insert denied');
with changed as (update public.work_rates set hourly_rate_ore = 1 returning *) select is((select count(*) from changed), 0::bigint, 'inactive rate update affects zero rows');
with changed as (update public.work_shifts set note = 'forged' returning *) select is((select count(*) from changed), 0::bigint, 'inactive shift update affects zero rows');
select throws_ok($$select public.copy_work_week('2027-03-22')$$, '42501', null, 'inactive copy denied');
select throws_ok(format('select public.cancel_work_shift(%L, %L)', :'shift_b', 'Feil vakt'), '42501', null, 'inactive cancellation denied');
select tests.logout();
set local role anon;
select throws_ok($$select * from public.work_rates$$, '42501', null, 'anon denied select on work_rates');
select throws_ok($$insert into public.work_rates default values$$, '42501', null, 'anon denied insert on work_rates');
select throws_ok($$update public.work_rates set id = id$$, '42501', null, 'anon denied update on work_rates');
select throws_ok($$delete from public.work_rates$$, '42501', null, 'anon denied delete on work_rates');
select throws_ok($$truncate public.work_rates$$, '42501', null, 'anon denied truncate on work_rates');
select throws_ok($$select * from public.work_shifts$$, '42501', null, 'anon denied select on work_shifts');
select throws_ok($$insert into public.work_shifts default values$$, '42501', null, 'anon denied insert on work_shifts');
select throws_ok($$update public.work_shifts set id = id$$, '42501', null, 'anon denied update on work_shifts');
select throws_ok($$delete from public.work_shifts$$, '42501', null, 'anon denied delete on work_shifts');
select throws_ok($$truncate public.work_shifts$$, '42501', null, 'anon denied truncate on work_shifts');

select throws_ok($$select public.copy_work_week('2027-03-22')$$, '42501', null, 'anon copy lacks execute');
select throws_ok($$select public.cancel_work_shift(gen_random_uuid(), 'Feil vakt')$$, '42501', null, 'anon cancellation lacks execute');
reset role;

-- Catalog-level privileges and all function contracts.
select ok((select relrowsecurity from pg_class where oid = 'public.work_rates'::regclass), 'work_rates RLS enabled');
select ok(not has_table_privilege('anon', 'public.work_rates', 'DELETE'), 'anon has no work_rates DELETE privilege');
select ok(not has_table_privilege('anon', 'public.work_rates', 'TRUNCATE'), 'anon has no work_rates TRUNCATE privilege');
select ok(not has_table_privilege('authenticated', 'public.work_rates', 'DELETE'), 'authenticated has no work_rates DELETE privilege');
select ok(not has_table_privilege('authenticated', 'public.work_rates', 'TRUNCATE'), 'authenticated has no work_rates TRUNCATE privilege');
select ok(not has_table_privilege('service_role', 'public.work_rates', 'DELETE'), 'service_role has no work_rates DELETE privilege');
select ok(not has_table_privilege('service_role', 'public.work_rates', 'TRUNCATE'), 'service_role has no work_rates TRUNCATE privilege');
select ok((select relrowsecurity from pg_class where oid = 'public.work_shifts'::regclass), 'work_shifts RLS enabled');
select ok(not has_table_privilege('anon', 'public.work_shifts', 'DELETE'), 'anon has no work_shifts DELETE privilege');
select ok(not has_table_privilege('anon', 'public.work_shifts', 'TRUNCATE'), 'anon has no work_shifts TRUNCATE privilege');
select ok(not has_table_privilege('authenticated', 'public.work_shifts', 'DELETE'), 'authenticated has no work_shifts DELETE privilege');
select ok(not has_table_privilege('authenticated', 'public.work_shifts', 'TRUNCATE'), 'authenticated has no work_shifts TRUNCATE privilege');
select ok(not has_table_privilege('service_role', 'public.work_shifts', 'DELETE'), 'service_role has no work_shifts DELETE privilege');
select ok(not has_table_privilege('service_role', 'public.work_shifts', 'TRUNCATE'), 'service_role has no work_shifts TRUNCATE privilege');
select is((select prosecdef from pg_proc where oid = 'public.planning_no_delete()'::regprocedure), true, 'planning_no_delete security mode');
select ok((select proconfig @> array['search_path=""'] from pg_proc where oid = 'public.planning_no_delete()'::regprocedure), 'planning_no_delete pins empty search path');
select ok(not has_function_privilege('anon', 'public.planning_no_delete()', 'EXECUTE'), 'anon cannot execute planning_no_delete');
select is(has_function_privilege('authenticated', 'public.planning_no_delete()', 'EXECUTE'), false, 'authenticated execute contract for planning_no_delete');
select is((select prosecdef from pg_proc where oid = 'public.work_rates_guard()'::regprocedure), true, 'work_rates_guard security mode');
select ok((select proconfig @> array['search_path=""'] from pg_proc where oid = 'public.work_rates_guard()'::regprocedure), 'work_rates_guard pins empty search path');
select ok(not has_function_privilege('anon', 'public.work_rates_guard()', 'EXECUTE'), 'anon cannot execute work_rates_guard');
select is(has_function_privilege('authenticated', 'public.work_rates_guard()', 'EXECUTE'), false, 'authenticated execute contract for work_rates_guard');
select is((select prosecdef from pg_proc where oid = 'public.work_shifts_guard()'::regprocedure), true, 'work_shifts_guard security mode');
select ok((select proconfig @> array['search_path=""'] from pg_proc where oid = 'public.work_shifts_guard()'::regprocedure), 'work_shifts_guard pins empty search path');
select ok(not has_function_privilege('anon', 'public.work_shifts_guard()', 'EXECUTE'), 'anon cannot execute work_shifts_guard');
select is(has_function_privilege('authenticated', 'public.work_shifts_guard()', 'EXECUTE'), false, 'authenticated execute contract for work_shifts_guard');
select is((select prosecdef from pg_proc where oid = 'public.planning_oslo_instant(timestamp without time zone)'::regprocedure), false, 'planning_oslo_instant security mode');
select ok((select proconfig @> array['search_path=""'] from pg_proc where oid = 'public.planning_oslo_instant(timestamp without time zone)'::regprocedure), 'planning_oslo_instant pins empty search path');
select ok(not has_function_privilege('anon', 'public.planning_oslo_instant(timestamp without time zone)', 'EXECUTE'), 'anon cannot execute planning_oslo_instant');
select is(has_function_privilege('authenticated', 'public.planning_oslo_instant(timestamp without time zone)', 'EXECUTE'), false, 'authenticated execute contract for planning_oslo_instant');
select is((select prosecdef from pg_proc where oid = 'public.cancel_work_shift(uuid,text)'::regprocedure), false, 'cancel_work_shift security mode');
select ok((select proconfig @> array['search_path=""'] from pg_proc where oid = 'public.cancel_work_shift(uuid,text)'::regprocedure), 'cancel_work_shift pins empty search path');
select ok(not has_function_privilege('anon', 'public.cancel_work_shift(uuid,text)', 'EXECUTE'), 'anon cannot execute cancel_work_shift');
select is(has_function_privilege('authenticated', 'public.cancel_work_shift(uuid,text)', 'EXECUTE'), true, 'authenticated execute contract for cancel_work_shift');
select is((select prosecdef from pg_proc where oid = 'public.copy_work_week(date)'::regprocedure), true, 'copy_work_week security mode');
select ok((select proconfig @> array['search_path=""'] from pg_proc where oid = 'public.copy_work_week(date)'::regprocedure), 'copy_work_week pins empty search path');
select ok(not has_function_privilege('anon', 'public.copy_work_week(date)', 'EXECUTE'), 'anon cannot execute copy_work_week');
select is(has_function_privilege('authenticated', 'public.copy_work_week(date)', 'EXECUTE'), true, 'authenticated execute contract for copy_work_week');

select tests.login_as_user(:'owner_id');
select throws_ok($$delete from public.work_rates$$, '42501', null, 'owner rate delete denied by ACL');
select throws_ok($$delete from public.work_shifts$$, '42501', null, 'owner shift delete denied by ACL');
select tests.logout();
select throws_ok($$delete from public.work_rates$$, 'P0001', 'PLANNING_NO_DELETE', 'postgres cannot delete rates');
select throws_ok($$delete from public.work_shifts$$, 'P0001', 'PLANNING_NO_DELETE', 'postgres cannot delete shifts');
select throws_ok(format('delete from public.profiles where id = %L', :'picker_a'), '23503', null, 'rate and shift FKs block profile deletion');
select ok(not exists(select from pg_constraint where conrelid in ('public.work_rates'::regclass, 'public.work_shifts'::regclass) and confrelid = 'public.profiles'::regclass and confdeltype <> 'r'), 'every profile FK uses RESTRICT');

-- Test-only permissive policies prove guards independently authorize all writes.
grant delete on public.work_rates, public.work_shifts to authenticated;
create policy test_rates_all on public.work_rates for all to authenticated using (true) with check (true);
create policy test_shifts_all on public.work_shifts for all to authenticated using (true) with check (true);
select tests.login_as_user(:'owner_id');
select throws_ok($$delete from public.work_rates$$, 'P0001', 'PLANNING_NO_DELETE', 'owner with temporary grant still cannot delete rates');
select throws_ok($$delete from public.work_shifts$$, 'P0001', 'PLANNING_NO_DELETE', 'owner with temporary grant still cannot delete shifts');

select tests.login_as_user(:'picker_a');
select throws_ok($$insert into public.work_rates (profile_id, hourly_rate_ore) values (auth.uid(), 123)$$, '42501', null, 'picker_a rate insert guard denies permissive policy');
select throws_ok($$update public.work_rates set hourly_rate_ore = 123$$, '42501', null, 'picker_a rate update guard denies permissive policy');
select throws_ok($$select tests.shift(auth.uid(), '2027-12-01 08:00', '2027-12-01 09:00')$$, '42501', null, 'picker_a shift insert guard denies permissive policy');
select throws_ok($$update public.work_shifts set note = 'forged'$$, '42501', null, 'picker_a shift update guard denies permissive policy');

select tests.login_as_user(:'seller_a');
select throws_ok($$insert into public.work_rates (profile_id, hourly_rate_ore) values (auth.uid(), 123)$$, '42501', null, 'seller_a rate insert guard denies permissive policy');
select throws_ok($$update public.work_rates set hourly_rate_ore = 123$$, '42501', null, 'seller_a rate update guard denies permissive policy');
select throws_ok($$select tests.shift(auth.uid(), '2027-12-01 08:00', '2027-12-01 09:00')$$, '42501', null, 'seller_a shift insert guard denies permissive policy');
select throws_ok($$update public.work_shifts set note = 'forged'$$, '42501', null, 'seller_a shift update guard denies permissive policy');

select tests.login_as_user(:'inactive');
select throws_ok($$insert into public.work_rates (profile_id, hourly_rate_ore) values (auth.uid(), 123)$$, '42501', null, 'inactive rate insert guard denies permissive policy');
select throws_ok($$update public.work_rates set hourly_rate_ore = 123$$, '42501', null, 'inactive rate update guard denies permissive policy');
select throws_ok($$select tests.shift(auth.uid(), '2027-12-01 08:00', '2027-12-01 09:00')$$, '42501', null, 'inactive shift insert guard denies permissive policy');
select throws_ok($$update public.work_shifts set note = 'forged'$$, '42501', null, 'inactive shift update guard denies permissive policy');

select tests.logout();
select throws_ok($$update public.work_rates set hourly_rate_ore = 123$$, '42501', null, 'null identity rate guard fails closed');
select throws_ok($$update public.work_shifts set note = 'forged'$$, '42501', null, 'null identity shift guard fails closed');
select * from finish();
rollback;
