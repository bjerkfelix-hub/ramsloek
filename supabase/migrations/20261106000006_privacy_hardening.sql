-- Step A hardening: scheduled purge of unsubscribed sign-ups, column-level anon read on market_days.

-- 1. Scheduled purge (privacy text promises deletion within 31 days of unsubscribing).
create extension if not exists pg_cron;

create or replace function public.purge_unsubscribed_signups_system() returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_count int;
begin
  delete from public.season_signups
  where unsubscribed_at < now() - interval '30 days';
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke all on function public.purge_unsubscribed_signups_system() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'purge-unsubscribed-signups') then
    perform cron.unschedule('purge-unsubscribed-signups');
  end if;
end $$;
select cron.schedule('purge-unsubscribed-signups', '17 3 * * *', $$select public.purge_unsubscribed_signups_system()$$);

-- 2. Anon may read only the public columns of market_days (not created_by / created_at).
revoke select on public.market_days from anon;
grant select (id, market_date, starts_at, ends_at, place_name, address, note_no, note_en, published, cancelled)
  on public.market_days to anon;
