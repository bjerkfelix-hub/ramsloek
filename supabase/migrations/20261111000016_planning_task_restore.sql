-- Owners may restore archived tasks without changing their contents.
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


create function public.restore_work_task(p_id uuid) returns void
language plpgsql security invoker set search_path = ''
as $$
declare
  v_task public.work_tasks;
begin
  if auth.uid() is null or public.app_role() is distinct from 'owner' then
    raise exception using errcode = '42501', message = 'PLANNING_OWNER_REQUIRED';
  end if;
  select * into v_task from public.work_tasks where id = p_id for update;
  if not found or v_task.archived_at is null then
    raise exception 'PLANNING_NOT_FOUND';
  end if;
  update public.work_tasks set archived_at = null, archived_by = null where id = p_id;
end $$;
revoke all on function public.restore_work_task(uuid) from public, anon, authenticated;
grant execute on function public.restore_work_task(uuid) to authenticated;
