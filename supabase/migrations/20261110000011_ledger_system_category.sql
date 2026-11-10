-- Categories that code depends on (system_key, e.g. 'market_sales' used by daily takings) can be
-- renamed and renumbered, but never deactivated: takings would otherwise fail with
-- LEDGER_CATEGORY_INACTIVE.
create or replace function public.ledger_categories_guard() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is not null and public.app_role() is distinct from 'owner' then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and (new.kind is distinct from old.kind or new.system_key is distinct from old.system_key) then
    raise exception 'LEDGER_IMMUTABLE';
  end if;
  if new.system_key is not null and not new.active then
    raise exception 'LEDGER_CATEGORY_SYSTEM';
  end if;
  return new;
end $$;
revoke all on function public.ledger_categories_guard() from public, anon, authenticated;
