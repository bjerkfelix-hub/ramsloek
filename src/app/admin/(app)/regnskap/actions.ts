'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { text, textOrNull, type ActionResult } from '@/lib/action-result'
import { dbErrorToMessage } from '@/lib/errors'
import { parseKr } from '@/lib/domain/money'
import type { LedgerKind, PaymentMethod } from '@/lib/domain/ledger'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE = /^\d{4}-\d{2}-\d{2}$/

// 'use server' modules may only export async functions.
const AMOUNT_ERROR = 'Skriv beløpet i kroner, for eksempel 1250,50.'
const EXPENSE_METHODS: PaymentMethod[] = ['card', 'vipps', 'cash', 'bank', 'private', 'unpaid']
const INCOME_METHODS: PaymentMethod[] = ['vipps', 'card', 'cash', 'bank']

type EntryResult = ActionResult & { entryId?: string; number?: string }
type TakingsResult = ActionResult & { takingsId?: string; numbers?: string[] }

function isRealDate(s: string): boolean {
  if (!DATE.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

/** Kroner text → øre; empty means 0 (only for takings fields). */
function optionalKr(raw: string): number | null {
  return raw === '' ? 0 : parseKr(raw)
}

export async function saveTakings(form: FormData): Promise<TakingsResult> {
  await requireRole('owner', 'seller')
  const marketDayId = text(form, 'market_day_id')
  if (!UUID.test(marketDayId)) return { ok: false, error: 'Velg markedsdag.' }
  const vipps = optionalKr(text(form, 'vipps'))
  const card = optionalKr(text(form, 'card'))
  const cash = optionalKr(text(form, 'cash'))
  if (vipps === null || card === null || cash === null) return { ok: false, error: AMOUNT_ERROR }
  if (vipps + card + cash === 0) return { ok: false, error: dbErrorToMessage({ message: 'TAKINGS_EMPTY' }) }
  const note = textOrNull(form, 'note')
  if (note && note.length > 500) return { ok: false, error: 'Notatet er for langt (maks 500 tegn).' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('market_takings')
    .insert({ market_day_id: marketDayId, vipps_ore: vipps, card_ore: card, cash_ore: cash, note })
    .select('id')
    .single()
  if (error || !data) {
    if (error?.code === '23505') return { ok: false, error: 'Dagsoppgjør for denne markedsdagen er allerede registrert.' }
    return { ok: false, error: dbErrorToMessage(error ?? {}) }
  }
  const { data: entries } = await supabase
    .from('ledger_entries')
    .select('number')
    .eq('takings_id', data.id)
    .order('number')
  revalidatePath('/admin/regnskap')
  return { ok: true, takingsId: data.id, numbers: (entries ?? []).map((e) => e.number) }
}

type ParsedEntry = {
  client_key: string
  entry_date: string
  amount_ore: number
  category_id: string
  counterparty: string | null
  description: string
  payment_method: PaymentMethod
  due_date: string | null
}

function parseEntry(form: FormData, methods: PaymentMethod[]): ParsedEntry | string {
  const clientKey = text(form, 'client_key')
  if (!UUID.test(clientKey)) return 'Last siden på nytt og prøv igjen.'
  const date = text(form, 'entry_date')
  if (!isRealDate(date)) return 'Velg en gyldig dato.'
  const amount = parseKr(text(form, 'amount'))
  if (amount === null) return AMOUNT_ERROR
  const category = text(form, 'category_id')
  if (!UUID.test(category)) return 'Velg kategori.'
  const description = text(form, 'description')
  if (!description) return 'Skriv hva posten gjelder.'
  if (description.length > 200) return 'Beskrivelsen er for lang (maks 200 tegn).'
  const counterparty = textOrNull(form, 'counterparty')
  if (counterparty && counterparty.length > 120) return 'Navnet er for langt (maks 120 tegn).'
  const method = text(form, 'payment_method') as PaymentMethod
  if (!methods.includes(method)) return 'Velg betaling.'
  const due = textOrNull(form, 'due_date')
  if (method === 'unpaid' && !due) return 'Velg forfallsdato.'
  if (due && !isRealDate(due)) return 'Velg en gyldig forfallsdato.'
  return {
    client_key: clientKey,
    entry_date: date,
    amount_ore: amount,
    category_id: category,
    counterparty,
    description,
    payment_method: method,
    due_date: method === 'unpaid' ? due : null,
  }
}

async function insertEntry(kind: LedgerKind, entry: ParsedEntry): Promise<EntryResult> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('ledger_entries')
    .insert({ kind, ...entry })
    .select('id, number')
    .single()
  if (error || !data) {
    if (error?.code === '23505') {
      // Same client_key: the first tap already saved this entry. Return it (idempotent retry).
      const { data: existing } = await supabase
        .from('ledger_entries')
        .select('id, number')
        .eq('client_key', entry.client_key)
        .maybeSingle()
      if (existing) return { ok: true, entryId: existing.id, number: existing.number }
    }
    return { ok: false, error: dbErrorToMessage(error ?? {}) }
  }
  revalidatePath('/admin/regnskap')
  return { ok: true, entryId: data.id, number: data.number }
}

export async function saveExpense(form: FormData): Promise<EntryResult> {
  await requireRole('owner', 'seller')
  const parsed = parseEntry(form, EXPENSE_METHODS)
  if (typeof parsed === 'string') {
    return { ok: false, error: parsed === 'Skriv hva posten gjelder.' ? 'Skriv hva utgiften gjelder.' : parsed }
  }
  return insertEntry('expense', parsed)
}

export async function saveIncome(form: FormData): Promise<EntryResult> {
  await requireRole('owner')
  const parsed = parseEntry(form, INCOME_METHODS)
  if (typeof parsed === 'string') {
    return { ok: false, error: parsed === 'Skriv hva posten gjelder.' ? 'Skriv hva inntekten gjelder.' : parsed }
  }
  return insertEntry('income', parsed)
}
