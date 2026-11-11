-- Retained task board; workers may only complete their currently assigned tasks.
create table public.work_tasks (
  id uuid primary key,
  title text not null check (length(btrim(title)) between 1 and 200),
  description text check (length(description) <= 10000),
  assigned_to uuid references public.profiles(id) on delete restrict,
  due_date date check (isfinite(due_date)),
  important boolean not null default false,
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done')),
  completed_at timestamptz(3),
  completed_by uuid references public.profiles(id) on delete restrict,
  archived_at timestamptz(3),
  archived_by uuid references public.profiles(id) on delete restrict,
  created_by uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  created_at timestamptz(3) not null,
  updated_at timestamptz(3) not null,
  check ((status = 'done' and completed_at is not null and isfinite(completed_at) and completed_by is not null)
    or (status <> 'done' and completed_at is null and completed_by is null)),
  check ((archived_at is null and archived_by is null)
    or (archived_at is not null and isfinite(archived_at) and archived_by is not null))
);
create index work_tasks_assigned_status_due on public.work_tasks(assigned_to, status, due_date)
  where archived_at is null;

create function public.work_tasks_guard() returns trigger
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
      raise exception 'TASK_ARCHIVED';
    end if;
    if v_role <> 'owner' then
      -- Whitelist by subtraction so added columns are protected automatically.
      if old.assigned_to is distinct from auth.uid() or new.status is distinct from 'done'
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

  if new.assigned_to is not null then
    if tg_op = 'INSERT' then
      perform 1 from public.profiles where id = new.assigned_to and active for share;
      if not found then raise exception 'PLANNING_INACTIVE_PERSON'; end if;
    elsif new.assigned_to is distinct from old.assigned_to then
      perform 1 from public.profiles where id = new.assigned_to and active for share;
      if not found then raise exception 'PLANNING_INACTIVE_PERSON'; end if;
    end if;
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
      and (to_jsonb(new) - 'updated_at') is not distinct from (to_jsonb(old) - 'updated_at') then
      return null;
    end if;
  end if;
  new.updated_at := v_now;
  return new;
end $$;
revoke all on function public.work_tasks_guard() from public, anon, authenticated;

create trigger work_tasks_guard before insert or update on public.work_tasks
  for each row execute function public.work_tasks_guard();
create trigger work_tasks_audit after insert or update on public.work_tasks
  for each row execute function public.audit_row_with_old();
create trigger work_tasks_no_delete before delete on public.work_tasks
  for each row execute function public.planning_no_delete();

alter table public.work_tasks enable row level security;
create policy work_tasks_select on public.work_tasks for select to authenticated
  using (public.app_role() = 'owner' or (public.app_role() in ('picker', 'seller')
    and assigned_to = auth.uid() and archived_at is null));
create policy work_tasks_insert on public.work_tasks for insert to authenticated
  with check (public.app_role() = 'owner');
create policy work_tasks_update on public.work_tasks for update to authenticated
  using (public.app_role() = 'owner' or (public.app_role() in ('picker', 'seller')
    and assigned_to = auth.uid() and archived_at is null))
  with check (public.app_role() = 'owner' or (public.app_role() in ('picker', 'seller')
    and assigned_to = auth.uid() and archived_at is null));
revoke all on public.work_tasks from public, anon, authenticated;
revoke delete, truncate on public.work_tasks from service_role;
grant select, insert, update on public.work_tasks to authenticated;

create function public.archive_work_task(p_id uuid) returns void
language plpgsql security invoker set search_path = ''
as $$
declare
  v_task public.work_tasks;
begin
  if auth.uid() is null or public.app_role() is distinct from 'owner' then
    raise exception using errcode = '42501', message = 'PLANNING_OWNER_REQUIRED';
  end if;
  select * into v_task from public.work_tasks where id = p_id for update;
  if not found then raise exception 'PLANNING_NOT_FOUND'; end if;
  if v_task.archived_at is not null then return; end if;
  update public.work_tasks set archived_at = pg_catalog.date_trunc('milliseconds', now())
    where id = p_id;
end $$;
revoke all on function public.archive_work_task(uuid) from public, anon, authenticated;
grant execute on function public.archive_work_task(uuid) to authenticated;
