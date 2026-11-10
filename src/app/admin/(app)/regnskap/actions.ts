'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { text, textOrNull, type ActionResult } from '@/lib/action-result'
import { dbErrorToMessage } from '@/lib/errors'
import { parseKrOrZero } from '@/lib/domain/money'
import type { LedgerKind } from '@/lib/domain/ledger'
import { AMOUNT_ERROR, parseEntryFields, UUID, type EntryFields } from '@/features/regnskap/entry-input'

type EntryResult = ActionResult & { entryId?: string; number?: string }
type TakingsResult = ActionResult & { takingsId?: string; numbers?: string[] }


export async function saveTakings(form: FormData): Promise<TakingsResult> {
  await requireRole('owner', 'seller')
  const marketDayId = text(form, 'market_day_id')
  if (!UUID.test(marketDayId)) return { ok: false, error: 'Velg markedsdag.' }
  const vipps = parseKrOrZero(text(form, 'vipps'))
  const card = parseKrOrZero(text(form, 'card'))
  const cash = parseKrOrZero(text(form, 'cash'))
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
  let takingsId = data?.id
  if (error || !data) {
    if (error?.code !== '23505') return { ok: false, error: dbErrorToMessage(error ?? {}) }
    // A retry after a lost response: if the active takings for this day is the caller's own with the
    // same amounts, the first attempt went through. Treat it as saved so the receipt upload follows.
    const { data: existing } = await supabase
      .from('market_takings')
      .select('id, vipps_ore, card_ore, cash_ore')
      .eq('market_day_id', marketDayId)
      .is('voided_at', null)
      .maybeSingle()
    const same = existing && existing.vipps_ore === vipps && existing.card_ore === card && existing.cash_ore === cash
    if (!same) return { ok: false, error: 'Dagsoppgjør for denne markedsdagen er allerede registrert.' }
    takingsId = existing.id
  }
  const { data: entries } = await supabase
    .from('ledger_entries')
    .select('number')
    .eq('takings_id', takingsId)
    .order('number')
  revalidatePath('/admin/regnskap')
  return { ok: true, takingsId, numbers: (entries ?? []).map((e) => e.number) }
}

async function insertEntry(kind: LedgerKind, clientKey: string, entry: EntryFields): Promise<EntryResult> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('ledger_entries')
    .insert({ kind, client_key: clientKey, ...entry })
    .select('id, number')
    .single()
  if (error || !data) {
    if (error?.code === '23505') {
      // Same client_key: the first tap already saved this entry. Return it (idempotent retry).
      const { data: existing } = await supabase
        .from('ledger_entries')
        .select('id, number')
        .eq('client_key', clientKey)
        .maybeSingle()
      if (existing) return { ok: true, entryId: existing.id, number: existing.number }
    }
    return { ok: false, error: dbErrorToMessage(error ?? {}) }
  }
  revalidatePath('/admin/regnskap')
  return { ok: true, entryId: data.id, number: data.number }
}

async function saveEntry(kind: LedgerKind, form: FormData): Promise<EntryResult> {
  const clientKey = text(form, 'client_key')
  if (!UUID.test(clientKey)) return { ok: false, error: 'Last siden på nytt og prøv igjen.' }
  const parsed = parseEntryFields(form, kind)
  if (typeof parsed === 'string') return { ok: false, error: parsed }
  return insertEntry(kind, clientKey, parsed)
}

export async function saveExpense(form: FormData): Promise<EntryResult> {
  await requireRole('owner', 'seller')
  return saveEntry('expense', form)
}

export async function saveIncome(form: FormData): Promise<EntryResult> {
  await requireRole('owner')
  return saveEntry('income', form)
}
