'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { text, type ActionResult } from '@/lib/action-result'
import { dbErrorToMessage } from '@/lib/errors'
import type { LedgerKind } from '@/lib/domain/ledger'
import { parseEntryFields, UUID } from '@/features/regnskap/entry-input'

const NOT_FOUND = 'Fant ikke posten.'

function refresh() {
  revalidatePath('/admin/regnskap', 'layout')
}

function reasonOf(form: FormData): string | null {
  const reason = text(form, 'reason')
  return reason.length >= 3 && reason.length <= 300 ? reason : null
}

/** Owner correction of an entry. The database keeps the old values in the audit log. */
export async function updateEntry(form: FormData): Promise<ActionResult> {
  await requireRole('owner')
  const id = text(form, 'id')
  if (!UUID.test(id)) return { ok: false, error: NOT_FOUND }
  const supabase = await createClient()
  const { data: current } = await supabase.from('ledger_entries').select('kind').eq('id', id).maybeSingle()
  if (!current) return { ok: false, error: NOT_FOUND }
  const parsed = parseEntryFields(form, current.kind as LedgerKind)
  if (typeof parsed === 'string') return { ok: false, error: parsed }
  const { data, error } = await supabase.from('ledger_entries').update(parsed).eq('id', id).select('id')
  if (error) return { ok: false, error: dbErrorToMessage(error) }
  if (!data?.length) return { ok: false, error: NOT_FOUND }
  refresh()
  return { ok: true }
}

export async function voidEntry(form: FormData): Promise<ActionResult> {
  await requireRole('owner')
  const id = text(form, 'id')
  if (!UUID.test(id)) return { ok: false, error: NOT_FOUND }
  const reason = reasonOf(form)
  if (!reason) return { ok: false, error: dbErrorToMessage({ message: 'LEDGER_VOID_REASON' }) }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('ledger_entries')
    .update({ voided_at: new Date().toISOString(), void_reason: reason })
    .eq('id', id)
    .select('id')
  if (error) return { ok: false, error: dbErrorToMessage(error) }
  if (!data?.length) return { ok: false, error: NOT_FOUND }
  refresh()
  return { ok: true }
}

/** Voids a whole daily takings; the database voids its entries in the same transaction. */
export async function voidTakings(form: FormData): Promise<ActionResult> {
  await requireRole('owner')
  const id = text(form, 'id')
  if (!UUID.test(id)) return { ok: false, error: NOT_FOUND }
  const reason = reasonOf(form)
  if (!reason) return { ok: false, error: dbErrorToMessage({ message: 'LEDGER_VOID_REASON' }) }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('market_takings')
    .update({ voided_at: new Date().toISOString(), void_reason: reason })
    .eq('id', id)
    .select('id')
  if (error) return { ok: false, error: dbErrorToMessage(error) }
  if (!data?.length) return { ok: false, error: NOT_FOUND }
  refresh()
  return { ok: true }
}

/** Marks an unpaid bill as paid, or money laid out privately as repaid. */
export async function settleEntry(id: string): Promise<ActionResult> {
  await requireRole('owner')
  if (!UUID.test(id)) return { ok: false, error: NOT_FOUND }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('ledger_entries')
    .update({ settled_at: new Date().toISOString() })
    .eq('id', id)
    .is('settled_at', null)
    .select('id')
  if (error) return { ok: false, error: dbErrorToMessage(error) }
  if (!data?.length) return { ok: false, error: NOT_FOUND }
  refresh()
  return { ok: true }
}
