-- Market days a seller or the owner can register daily takings for.
-- Sellers cannot read past market days through RLS (only published upcoming ones), and they
-- cannot see other people's takings. This narrow function returns exactly what the
-- "Dagsoppgjør" form needs: recent, past-or-today, non-cancelled days without active takings.
create function public.takings_market_days()
returns table(id uuid, market_date date, place_name text)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Europe/Oslo')::date;
begin
  if coalesce(public.app_role()::text, '') not in ('owner', 'seller') then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;
  return query
    select d.id, d.market_date, d.place_name
    from public.market_days d
    where d.market_date <= v_today
      and d.market_date > v_today - 60
      and not d.cancelled
      and not exists (
        select 1 from public.market_takings t where t.market_day_id = d.id and t.voided_at is null
      )
    order by d.market_date desc, d.starts_at desc
    limit 30;
end $$;
revoke all on function public.takings_market_days() from public, anon, authenticated;
grant execute on function public.takings_market_days() to authenticated;
