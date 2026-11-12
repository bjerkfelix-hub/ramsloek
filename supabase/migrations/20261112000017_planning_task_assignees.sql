-- One shared task, with an audited set of assignees.
create table public.work_task_assignees (
  task_id uuid not null references public.work_tasks(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  added_by uuid not null default auth.uid() references public.profiles(id),
  added_at timestamptz(3) not null default date_trunc('milliseconds', now()),
  primary key (task_id, profile_id)
);
create index work_task_assignees_profile_task on public.work_task_assignees(profile_id, task_id);
alter table public.work_task_assignees enable row level security;
revoke all on public.work_task_assignees from public, anon, authenticated, service_role;
grant select on public.work_task_assignees to authenticated;

-- Existing tables keep their id and INSERT/UPDATE payload format. Membership
-- events use the task id; data.old/new also retain the profile part of the key.
create or replace function public.audit_row_with_old() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  insert into public.audit_log(actor, table_name, row_id, action, data)
  values (auth.uid(), tg_table_name, coalesce(v_row->>'id', v_row->>'task_id'), tg_op,
    case when tg_op = 'INSERT' then jsonb_build_object('new', to_jsonb(new))
      when tg_op = 'DELETE' then jsonb_build_object('old', to_jsonb(old))
      else jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new)) end);
  return null;
end $$;
revoke all on function public.audit_row_with_old() from public, anon, authenticated;

-- Preserve original attribution; historical task audits retain assigned_to.
insert into public.work_task_assignees(task_id, profile_id, added_by, added_at)
select id, assigned_to, created_by, coalesce(updated_at, created_at)
from public.work_tasks where assigned_to is not null;
create trigger work_task_assignees_audit after insert or update or delete on public.work_task_assignees
  for each row execute function public.audit_row_with_old();

drop policy work_tasks_select on public.work_tasks;
drop policy work_tasks_update on public.work_tasks;
drop index public.work_tasks_assigned_status_due;
alter table public.work_tasks drop column assigned_to;

create function public.is_work_task_assignee(p_task uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select from public.work_task_assignees where task_id = p_task and profile_id = auth.uid()) $$;
revoke all on function public.is_work_task_assignee(uuid) from public, anon, authenticated;
grant execute on function public.is_work_task_assignee(uuid) to authenticated;

create policy work_tasks_select on public.work_tasks for select to authenticated
  using (public.app_role() = 'owner' or (public.app_role() in ('picker', 'seller')
    and public.is_work_task_assignee(id) and archived_at is null));
create policy work_tasks_update on public.work_tasks for update to authenticated
  using (public.app_role() = 'owner' or (public.app_role() in ('picker', 'seller')
    and public.is_work_task_assignee(id) and archived_at is null))
  with check (public.app_role() = 'owner' or (public.app_role() in ('picker', 'seller')
    and public.is_work_task_assignee(id) and archived_at is null));
create policy work_task_assignees_select on public.work_task_assignees for select to authenticated
  using (public.app_role() = 'owner' or (public.app_role() in ('picker', 'seller')
    and public.is_work_task_assignee(task_id)
    and exists(select from public.work_tasks t where t.id = task_id and t.archived_at is null)));

create or replace function public.work_tasks_guard() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_role public.app_role := public.app_role();
  v_now timestamptz := pg_catalog.date_trunc('milliseconds', now());
begin
  if auth.uid() is null or v_role is null then
    raise exception using errcode = '42501', message = 'PLANNING_ACTIVE_REQUIRED';
  end if;
  if tg_op = 'UPDATE' then
    if old.archived_at is not null then
      -- Only an owner may restore, preserving every other stored field.
      if v_role = 'owner' and new.archived_at is null and new.archived_by is null
        and (to_jsonb(new) - array['archived_at','archived_by','updated_at'])
          is not distinct from (to_jsonb(old) - array['archived_at','archived_by','updated_at']) then
        new.updated_at := v_now;
        return new;
      end if;
      raise exception 'TASK_ARCHIVED';
    end if;
    if v_role <> 'owner' then
      -- Whitelist by subtraction so added columns are protected automatically.
      if not public.is_work_task_assignee(old.id) or new.status is distinct from 'done'
        or (to_jsonb(new) - array['status','completed_at','completed_by','updated_at'])
          is distinct from (to_jsonb(old) - array['status','completed_at','completed_by','updated_at']) then
        raise exception 'TASK_COMPLETION_ONLY';
      end if;
      if old.status = 'done' then
        return null;
      end if;
    else
      if row(new.id, new.created_by, new.created_at)
        is distinct from row(old.id, old.created_by, old.created_at) then
        raise exception 'PLANNING_IMMUTABLE';
      end if;
      if new.archived_at is not null or new.archived_by is not null then
        if (to_jsonb(new) - array['archived_at','archived_by','updated_at'])
          is distinct from (to_jsonb(old) - array['archived_at','archived_by','updated_at']) then
          raise exception 'PLANNING_IMMUTABLE';
        end if;
        new.archived_at := v_now;
        new.archived_by := auth.uid();
        new.updated_at := v_now;
        return new;
      end if;
    end if;
  else
    if v_role <> 'owner' then
      raise exception using errcode = '42501', message = 'PLANNING_OWNER_REQUIRED';
    end if;
    if new.created_by is distinct from auth.uid() then
      raise exception using errcode = '42501', message = 'PLANNING_OWNER_REQUIRED';
    end if;
    if new.archived_at is not null or new.archived_by is not null then
      raise exception 'TASK_ARCHIVED';
    end if;
    new.created_by := auth.uid();
    new.created_at := v_now;
  end if;

  new.title := btrim(new.title);
  if new.status = 'done' then
    if tg_op = 'UPDATE' then
      if old.status = 'done' then
        new.completed_at := old.completed_at;
        new.completed_by := old.completed_by;
      else
        new.completed_at := v_now;
        new.completed_by := auth.uid();
      end if;
    else
      new.completed_at := v_now;
      new.completed_by := auth.uid();
    end if;
  else
    new.completed_at := null;
    new.completed_by := null;
  end if;
  -- Ignore forged update timestamps on unchanged repeated completions.
  if tg_op = 'UPDATE' then
    if old.status = 'done' and new.status = 'done'
      and (to_jsonb(new) - 'updated_at') is not distinct from (to_jsonb(old) - 'updated_at')
      and not (v_role = 'owner' and coalesce(current_setting('planning.assignees_task', true), '') = new.id::text) then
      return null;
    end if;
  end if;
  new.updated_at := v_now;
  return new;
end $$;
revoke all on function public.work_tasks_guard() from public, anon, authenticated;


create function public.set_work_task_assignees(p_task_id uuid, p_people uuid[]) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_task public.work_tasks;
  v_people uuid[];
  v_existing uuid[];
  v_previous_context text := current_setting('planning.assignees_task', true);
begin
  if auth.uid() is null or public.app_role() is distinct from 'owner' then
    raise exception using errcode = '42501', message = 'PLANNING_OWNER_REQUIRED';
  end if;
  select * into v_task from public.work_tasks where id = p_task_id for update;
  if not found then raise exception 'PLANNING_NOT_FOUND'; end if;
  if v_task.archived_at is not null then raise exception 'TASK_ARCHIVED'; end if;
  select coalesce(array_agg(distinct person order by person), '{}'::uuid[]) into v_people from unnest(p_people) person;
  if array_position(v_people, null) is not null then raise exception 'PLANNING_INACTIVE_PERSON'; end if;
  select coalesce(array_agg(profile_id order by profile_id), '{}'::uuid[]) into v_existing
    from public.work_task_assignees where task_id = p_task_id;
  if v_people = v_existing then return; end if;
  -- Lock new profiles against concurrent deactivation until the set is saved.
  perform 1 from public.profiles where id = any(v_people) and not (id = any(v_existing)) and active order by id for share;
  if exists(select from unnest(v_people) person where not (person = any(v_existing))
    and not exists(select from public.profiles where id = person and active)) then
    raise exception 'PLANNING_INACTIVE_PERSON';
  end if;
  delete from public.work_task_assignees where task_id = p_task_id and not (profile_id = any(v_people));
  insert into public.work_task_assignees(task_id, profile_id)
    select p_task_id, person from unnest(v_people) person where not (person = any(v_existing));
  -- Allow the normal guard to stamp a real membership edit on a done task.
  -- This context only affects owner timestamp-only no-ops, never worker rights.
  perform set_config('planning.assignees_task', p_task_id::text, true);
  update public.work_tasks set updated_at = date_trunc('milliseconds', now()) where id = p_task_id;
  perform set_config('planning.assignees_task', coalesce(v_previous_context, ''), true);
end $$;
revoke all on function public.set_work_task_assignees(uuid,uuid[]) from public, anon, authenticated;
grant execute on function public.set_work_task_assignees(uuid,uuid[]) to authenticated;
