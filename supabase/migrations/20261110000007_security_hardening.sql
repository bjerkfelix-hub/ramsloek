-- Security hardening after the 2026-11-08 audit (docs/security/2026-11-08-qwen-audit.md).
-- Safe to paste into the Supabase SQL editor; idempotent where practical.

-- 1. season_signups: owners read through RLS (admin list + CSV export use the session client).
--    anon keeps no grants; authenticated gets SELECT only (no insert/update/delete).
--    Sign-up and unsubscribe keep using the service role on the server.
grant select on public.season_signups to authenticated;

drop policy if exists season_signups_owner_select on public.season_signups;
create policy season_signups_owner_select on public.season_signups
  for select to authenticated
  using (public.app_role() = 'owner');

-- 2. New users take their role from app_metadata (settable only with the service role),
--    never from user_metadata. Full name still comes from user_metadata (fallback: e-mail).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    coalesce(new.raw_app_meta_data ->> 'role', 'picker')::public.app_role
  );
  return new;
end $$;
revoke all on function public.handle_new_user() from public, anon, authenticated;
