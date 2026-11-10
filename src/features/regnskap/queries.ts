import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { meterLevel, type MeterLevel, type LedgerKind, type PaymentMethod } from '@/lib/domain/ledger'
import { presetPeriod, type Period } from '@/lib/domain/periods'

export type Totals = { incomeOre: number; expenseOre: number; profitOre: number }

export type OwnerOverview = {
  month: Totals
  year: Totals
  missingReceipts: number
  unpaid: { count: number; totalOre: number }
  owedBack: { name: string; totalOre: number }[]
  meter: { incomeOre: number; level: MeterLevel }
}

export type MyEntry = {
  id: string
  number: string
  entryDate: string
  kind: LedgerKind
  description: string
  amountOre: number
  paymentMethod: PaymentMethod
  voided: boolean
  hasReceipt: boolean
}

type Supabase = Awaited<ReturnType<typeof createClient>>

async function totals(supabase: Supabase, period: Period): Promise<Totals> {
  const { data, error } = await supabase.rpc('ledger_totals', { p_from: period.from, p_to: period.to })
  if (error) throw error
  const row = (data as { income_ore: number; expense_ore: number; profit_ore: number }[] | null)?.[0]
  return {
    incomeOre: Number(row?.income_ore ?? 0),
    expenseOre: Number(row?.expense_ore ?? 0),
    profitOre: Number(row?.profit_ore ?? 0),
  }
}

/** Receipt coverage: ids of entries and takings that have at least one receipt (as visible to the caller). */
async function receiptParents(supabase: Supabase): Promise<{ entries: Set<string>; takings: Set<string> }> {
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

function hasReceipt(e: { id: string; takings_id: string | null }, r: { entries: Set<string>; takings: Set<string> }) {
  return r.entries.has(e.id) || (e.takings_id !== null && r.takings.has(e.takings_id))
}

/** Owner dashboard figures. `today` is the Oslo date (YYYY-MM-DD). */
export async function getOwnerOverview(today: string): Promise<OwnerOverview> {
  const supabase = await createClient()
  const [month, year, meterRes, openRes, receipts] = await Promise.all([
    totals(supabase, presetPeriod('this-month', today)),
    totals(supabase, presetPeriod('this-year', today)),
    supabase.rpc('mva_meter'),
    supabase
      .from('ledger_entries')
      .select('id, takings_id, payment_method, settled_at, amount_ore, created_by')
      .is('voided_at', null),
    receiptParents(supabase),
  ])
  if (meterRes.error) throw meterRes.error
  if (openRes.error) throw openRes.error

  const rows = openRes.data ?? []
  const missingReceipts = rows.filter((e) => !hasReceipt(e, receipts)).length

  const unpaidRows = rows.filter((e) => e.payment_method === 'unpaid' && !e.settled_at)
  const privateRows = rows.filter((e) => e.payment_method === 'private' && !e.settled_at)

  const owed = new Map<string, number>()
  for (const e of privateRows) owed.set(e.created_by, (owed.get(e.created_by) ?? 0) + e.amount_ore)
  let names = new Map<string, string>()
  if (owed.size > 0) {
    const { data: people, error } = await supabase.from('profiles').select('id, full_name').in('id', [...owed.keys()])
    if (error) throw error
    names = new Map((people ?? []).map((p) => [p.id, p.full_name]))
  }

  const meterRow = (meterRes.data as { income_ore: number }[] | null)?.[0]
  const meterIncome = Number(meterRow?.income_ore ?? 0)

  return {
    month,
    year,
    missingReceipts,
    unpaid: { count: unpaidRows.length, totalOre: unpaidRows.reduce((s, e) => s + e.amount_ore, 0) },
    owedBack: [...owed.entries()]
      .map(([id, totalOre]) => ({ name: names.get(id) ?? 'Ukjent', totalOre }))
      .sort((a, b) => a.name.localeCompare(b.name, 'nb')),
    meter: { incomeOre: meterIncome, level: meterLevel(meterIncome) },
  }
}

/** The caller's own entries. RLS limits sellers to their own rows from the last 30 days. */
export async function getMyRecent(userId: string): Promise<MyEntry[]> {
  const supabase = await createClient()
  const [entriesRes, receipts] = await Promise.all([
    supabase
      .from('ledger_entries')
      .select('id, number, entry_date, kind, description, amount_ore, payment_method, voided_at, takings_id')
      .eq('created_by', userId)
      .order('created_at', { ascending: false })
      .limit(100),
    receiptParents(supabase),
  ])
  if (entriesRes.error) throw entriesRes.error
  return (entriesRes.data ?? []).map((e) => ({
    id: e.id,
    number: e.number,
    entryDate: e.entry_date,
    kind: e.kind as LedgerKind,
    description: e.description,
    amountOre: e.amount_ore,
    paymentMethod: e.payment_method as PaymentMethod,
    voided: e.voided_at !== null,
    hasReceipt: hasReceipt(e, receipts),
  }))
}
