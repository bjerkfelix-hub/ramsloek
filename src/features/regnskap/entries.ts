import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type { LedgerKind, PaymentMethod } from '@/lib/domain/ledger'
import type { Period } from '@/lib/domain/periods'

export type EntryFlag = 'missing-receipt' | 'unpaid' | 'private'

export type EntryFilter = {
  period: Period
  kind: LedgerKind | null
  categoryId: string | null
  flag: EntryFlag | null
  showVoided: boolean
}

export type EntryRow = {
  id: string
  number: string
  entryDate: string
  kind: LedgerKind
  category: string
  accountNo: string
  counterparty: string | null
  description: string
  amountOre: number
  paymentMethod: PaymentMethod
  dueDate: string | null
  settledAt: string | null
  voided: boolean
  voidReason: string | null
  takingsId: string | null
  hasReceipt: boolean
}

type RawEntry = {
  id: string
  number: string
  entry_date: string
  kind: string
  counterparty: string | null
  description: string
  amount_ore: number
  payment_method: string
  due_date: string | null
  settled_at: string | null
  voided_at: string | null
  void_reason: string | null
  takings_id: string | null
  ledger_categories: { name: string; account_no: string } | null
}

const COLUMNS =
  'id, number, entry_date, kind, counterparty, description, amount_ore, payment_method, due_date, settled_at, voided_at, void_reason, takings_id, ledger_categories(name, account_no)'

export async function receiptCoverage(): Promise<{ entries: Set<string>; takings: Set<string> }> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('ledger_receipts').select('entry_id, takings_id')
  if (error) throw error
  const entries = new Set<string>()
  const takings = new Set<string>()
  for (const r of data ?? []) {
    if (r.entry_id) entries.add(r.entry_id)
    if (r.takings_id) takings.add(r.takings_id)
  }
  return { entries, takings }
}

export function toRow(e: RawEntry, coverage: { entries: Set<string>; takings: Set<string> }): EntryRow {
  return {
    id: e.id,
    number: e.number,
    entryDate: e.entry_date,
    kind: e.kind as LedgerKind,
    category: e.ledger_categories?.name ?? '',
    accountNo: e.ledger_categories?.account_no ?? '',
    counterparty: e.counterparty,
    description: e.description,
    amountOre: e.amount_ore,
    paymentMethod: e.payment_method as PaymentMethod,
    dueDate: e.due_date,
    settledAt: e.settled_at,
    voided: e.voided_at !== null,
    voidReason: e.void_reason,
    takingsId: e.takings_id,
    hasReceipt: coverage.entries.has(e.id) || (e.takings_id !== null && coverage.takings.has(e.takings_id)),
  }
}

/** Owner list of entries for a period with filters. Newest first. */
export async function listEntries(filter: EntryFilter): Promise<EntryRow[]> {
  const supabase = await createClient()
  let q = supabase
    .from('ledger_entries')
    .select(COLUMNS)
    .gte('entry_date', filter.period.from)
    .lte('entry_date', filter.period.to)
    .order('entry_date', { ascending: false })
    .order('number', { ascending: false })
    .limit(1000)
  if (filter.kind) q = q.eq('kind', filter.kind)
  if (filter.categoryId) q = q.eq('category_id', filter.categoryId)
  if (!filter.showVoided) q = q.is('voided_at', null)
  if (filter.flag === 'unpaid') q = q.eq('payment_method', 'unpaid').is('settled_at', null)
  if (filter.flag === 'private') q = q.eq('payment_method', 'private').is('settled_at', null)
  const [{ data, error }, coverage] = await Promise.all([q, receiptCoverage()])
  if (error) throw error
  const rows = ((data ?? []) as unknown as RawEntry[]).map((e) => toRow(e, coverage))
  return filter.flag === 'missing-receipt' ? rows.filter((r) => !r.hasReceipt && !r.voided) : rows
}

export async function getEntry(id: string): Promise<EntryRow | null> {
  const supabase = await createClient()
  const [{ data, error }, coverage] = await Promise.all([
    supabase.from('ledger_entries').select(COLUMNS).eq('id', id).maybeSingle(),
    receiptCoverage(),
  ])
  if (error) throw error
  return data ? toRow(data as unknown as RawEntry, coverage) : null
}
