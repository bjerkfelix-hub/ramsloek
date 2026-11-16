-- Receipt rows must refer to stored bytes. Keep existing authorization and immutability checks.
create or replace function public.ledger_receipts_guard() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_metadata jsonb;
begin
  if tg_op = 'UPDATE' then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;
  if auth.uid() is not null then
    if coalesce(public.app_role()::text, '') not in ('owner', 'seller')
      or new.uploaded_by is distinct from auth.uid() then
      raise exception 'insufficient_privilege' using errcode = '42501';
    end if;
  end if;
  -- Raise before RETURNING's RLS visibility check can mask the XOR violation.
  if (new.entry_id is null) = (new.takings_id is null) then
    raise exception 'receipt must have exactly one parent' using errcode = '23514';
  end if;
  if public.app_role() = 'seller' then
    if not (exists (
      select 1 from public.ledger_entries e where e.id = new.entry_id
        and e.created_by = auth.uid() and e.voided_at is null and e.created_at > now() - interval '30 days'
    ) or exists (
      select 1 from public.market_takings t where t.id = new.takings_id
        and t.created_by = auth.uid() and t.voided_at is null and t.created_at > now() - interval '30 days'
    )) then
      raise exception 'RECEIPT_PARENT_INVALID';
    end if;
  end if;
  -- Storage uses the full key as the object name, including the receipts/ prefix.
  select o.metadata into v_metadata from storage.objects o
  where o.bucket_id = 'receipts' and o.name = new.storage_key;
  if not found then
    raise exception 'RECEIPT_OBJECT_MISSING' using errcode = '23514';
  end if;
  new.size_bytes := (v_metadata ->> 'size')::integer;
  new.mime_type := v_metadata ->> 'mimetype';
  -- ledger_receipts_storage_key_key already enforces uniqueness, including concurrent inserts.
  new.uploaded_at := now();
  return new;
end $$;
revoke all on function public.ledger_receipts_guard() from public, anon, authenticated;

