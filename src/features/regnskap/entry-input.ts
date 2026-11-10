import { text, textOrNull } from '@/lib/action-result'
import { parseKr } from '@/lib/domain/money'
import type { LedgerKind, PaymentMethod } from '@/lib/domain/ledger'

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const AMOUNT_ERROR = 'Skriv beløpet i kroner, for eksempel 1250,50.'
export const METHODS: Record<LedgerKind, PaymentMethod[]> = {
  expense: ['card', 'vipps', 'cash', 'bank', 'private', 'unpaid'],
  income: ['vipps', 'card', 'cash', 'bank'],
}

export function isRealDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

export type EntryFields = {
  entry_date: string
  amount_ore: number
  category_id: string
  counterparty: string | null
  description: string
  payment_method: PaymentMethod
  due_date: string | null
}

/** Validates the editable fields of an income or expense entry. Returns the fields or a Norwegian error. */
export function parseEntryFields(form: FormData, kind: LedgerKind): EntryFields | string {
  const date = text(form, 'entry_date')
  if (!isRealDate(date)) return 'Velg en gyldig dato.'
  const amount = parseKr(text(form, 'amount'))
  if (amount === null) return AMOUNT_ERROR
  const category = text(form, 'category_id')
  if (!UUID.test(category)) return 'Velg kategori.'
  const description = text(form, 'description')
  if (!description) return kind === 'expense' ? 'Skriv hva utgiften gjelder.' : 'Skriv hva inntekten gjelder.'
  if (description.length > 200) return 'Beskrivelsen er for lang (maks 200 tegn).'
  const counterparty = textOrNull(form, 'counterparty')
  if (counterparty && counterparty.length > 120) return 'Navnet er for langt (maks 120 tegn).'
  const method = text(form, 'payment_method') as PaymentMethod
  if (!METHODS[kind].includes(method)) return 'Velg betaling.'
  const due = textOrNull(form, 'due_date')
  if (method === 'unpaid' && !due) return 'Velg forfallsdato.'
  if (due && !isRealDate(due)) return 'Velg en gyldig forfallsdato.'
  return {
    entry_date: date,
    amount_ore: amount,
    category_id: category,
    counterparty,
    description,
    payment_method: method,
    due_date: method === 'unpaid' ? due : null,
  }
}
