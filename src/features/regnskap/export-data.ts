import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { receiptFileName, uniqueNames, type ExportEntry, type LedgerKind, type PaymentMethod } from '@/lib/domain/ledger'
import { MIME_EXT, type ReceiptMime } from '@/lib/domain/file-sniff'
import type { Period } from '@/lib/domain/periods'

export type ExportFile = { name: string; key: string }
export type ExportData = { entries: ExportEntry[]; files: ExportFile[] }

type RawEntry = {
  id: string
  number: string
  entry_date: string
  kind: string
  counterparty: string | null
  description: string
  amount_ore: number
  payment_method: string
  voided_at: string | null
  void_reason: string | null
  takings_id: string | null
  ledger_categories: { name: string; account_no: string } | null
}
type RawReceipt = { entry_id: string | null; takings_id: string | null; storage_key: string; mime_type: string; uploaded_at: string }

/**
 * Everything in a period, voided entries included (they are listed but excluded from sums).
 * Receipt names are computed once here so the Excel sheet and the zip agree exactly.
 * Takings reports are attached to the takings' first entry with the suffix "rapport".
 */
export async function loadExport(period: Period): Promise<ExportData> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('ledger_entries')
    .select('id, number, entry_date, kind, counterparty, description, amount_ore, payment_method, voided_at, void_reason, takings_id, ledger_categories(name, account_no)')
    .gte('entry_date', period.from)
    .lte('entry_date', period.to)
    .order('entry_date')
    .order('number')
  if (error) throw error
  const raw = (data ?? []) as unknown as RawEntry[]

  const entryIds = raw.map((e) => e.id)
  const takingsIds = [...new Set(raw.map((e) => e.takings_id).filter((t): t is string => !!t))]
  const receipts: RawReceipt[] = []
  // Chunk the id lists to keep request URLs short.
  for (const [column, ids] of [['entry_id', entryIds], ['takings_id', takingsIds]] as const) {
    for (let i = 0; i < ids.length; i += 150) {
      const { data: rows, error: rErr } = await supabase
        .from('ledger_receipts')
        .select('entry_id, takings_id, storage_key, mime_type, uploaded_at')
        .in(column, ids.slice(i, i + 150))
        .order('uploaded_at')
      if (rErr) throw rErr
      receipts.push(...((rows ?? []) as RawReceipt[]))
    }
  }

  // First entry (by number) of each takings carries that takings' report receipts.
  const takingsOwner = new Map<string, RawEntry>()
  for (const e of [...raw].sort((a, b) => a.number.localeCompare(b.number))) {
    if (e.takings_id && !takingsOwner.has(e.takings_id)) takingsOwner.set(e.takings_id, e)
  }

  const byId = new Map(raw.map((e) => [e.id, e]))
  const planned: { entryId: string; name: string; key: string }[] = []
  for (const r of receipts) {
    const owner = r.entry_id ? byId.get(r.entry_id) : r.takings_id ? takingsOwner.get(r.takings_id) : undefined
    if (!owner) continue
    planned.push({
      entryId: owner.id,
      key: r.storage_key,
      name: receiptFileName({
        number: owner.number,
        category: owner.ledger_categories?.name ?? '',
        counterparty: owner.counterparty,
        suffix: r.takings_id ? 'rapport' : undefined,
        ext: MIME_EXT[r.mime_type as ReceiptMime] ?? 'bin',
      }),
    })
  }
  planned.sort((a, b) => a.name.localeCompare(b.name))
  const names = uniqueNames(planned.map((p) => p.name))
  const namesByEntry = new Map<string, string[]>()
  planned.forEach((p, i) => namesByEntry.set(p.entryId, [...(namesByEntry.get(p.entryId) ?? []), names[i]]))

  const entries: ExportEntry[] = raw.map((e) => ({
    number: e.number,
    entryDate: e.entry_date,
    kind: e.kind as LedgerKind,
    category: e.ledger_categories?.name ?? '',
    accountNo: e.ledger_categories?.account_no ?? '',
    counterparty: e.counterparty,
    description: e.description,
    paymentMethod: e.payment_method as PaymentMethod,
    amountOre: e.amount_ore,
    voided: e.voided_at !== null,
    voidReason: e.void_reason,
    receiptNames: namesByEntry.get(e.id) ?? [],
  }))
  return { entries, files: planned.map((p, i) => ({ name: names[i], key: p.key })) }
}
