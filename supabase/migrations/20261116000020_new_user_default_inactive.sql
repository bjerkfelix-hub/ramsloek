-- Only trusted, valid app metadata grants an active application profile.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_role text := new.raw_app_meta_data ->> 'role';
  v_active boolean := coalesce(v_role in ('owner', 'picker', 'seller'), false);
begin
  insert into public.profiles (id, full_name, role, active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    case when v_active then v_role::public.app_role else 'picker'::public.app_role end,
    v_active
  );
  return new;
end $$;
revoke all on function public.handle_new_user() from public, anon, authenticated;
