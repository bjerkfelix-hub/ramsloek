import { formatKr } from '@/lib/domain/money'
import { PAYMENT_LABEL, type PaymentMethod } from '@/lib/domain/ledger'

export type AuditRow = { id: number; at: string; actor: string | null; action: string; data: { old?: Record<string, unknown>; new?: Record<string, unknown> } }
export type Change = { field: string; from: string; to: string }
export type HistoryItem = { at: string; actor: string | null; action: 'created' | 'changed'; changes: Change[] }

const FIELDS: { key: string; label: string; format: (v: unknown, categories: Map<string, string>) => string }[] = [
  { key: 'entry_date', label: 'Dato', format: (v) => String(v ?? '–') },
  { key: 'amount_ore', label: 'Beløp', format: (v) => (typeof v === 'number' ? formatKr(v) : '–') },
  { key: 'category_id', label: 'Kategori', format: (v, c) => c.get(String(v)) ?? '–' },
  { key: 'counterparty', label: 'Motpart', format: (v) => (v ? String(v) : '–') },
  { key: 'description', label: 'Beskrivelse', format: (v) => String(v ?? '–') },
  { key: 'payment_method', label: 'Betaling', format: (v) => PAYMENT_LABEL[v as PaymentMethod] ?? String(v) },
  { key: 'due_date', label: 'Forfall', format: (v) => (v ? String(v) : '–') },
  { key: 'settled_at', label: 'Oppgjort', format: (v) => (v ? 'Ja' : 'Nei') },
  { key: 'voided_at', label: 'Annullert', format: (v) => (v ? 'Ja' : 'Nei') },
  { key: 'void_reason', label: 'Grunn', format: (v) => (v ? String(v) : '–') },
]

/** Turns audit rows (old/new snapshots) into readable changes, oldest first. */
export function describeHistory(rows: AuditRow[], categories: Map<string, string>): HistoryItem[] {
  return rows.map((r) => {
    if (r.action === 'INSERT' || !r.data.old) return { at: r.at, actor: r.actor, action: 'created', changes: [] }
    const before = r.data.old
    const after = r.data.new ?? {}
    const changes: Change[] = []
    for (const f of FIELDS) {
      if (JSON.stringify(before[f.key] ?? null) !== JSON.stringify(after[f.key] ?? null)) {
        changes.push({ field: f.label, from: f.format(before[f.key], categories), to: f.format(after[f.key], categories) })
      }
    }
    return { at: r.at, actor: r.actor, action: 'changed', changes }
  })
}
