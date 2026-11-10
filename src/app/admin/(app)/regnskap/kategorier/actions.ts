'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { text, type ActionResult } from '@/lib/action-result'
import { dbErrorToMessage } from '@/lib/errors'
import { UUID } from '@/features/regnskap/entry-input'

function refresh() {
  revalidatePath('/admin/regnskap', 'layout')
}

/** Adds a category (with kind) or updates name, account number and order of an existing one. */
export async function saveCategory(form: FormData): Promise<ActionResult> {
  await requireRole('owner')
  const id = text(form, 'id')
  if (id && !UUID.test(id)) return { ok: false, error: 'Fant ikke kategorien.' }
  const name = text(form, 'name')
  if (!name) return { ok: false, error: 'Skriv et navn.' }
  if (name.length > 60) return { ok: false, error: 'Navnet er for langt (maks 60 tegn).' }
  const accountNo = text(form, 'account_no')
  if (!/^\d{4}$/.test(accountNo)) return { ok: false, error: 'Kontonummer er fire siffer.' }
  const sortRaw = text(form, 'sort')
  const sort = sortRaw === '' ? 0 : Number(sortRaw)
  if (!Number.isInteger(sort) || sort < 0 || sort > 10000) return { ok: false, error: 'Rekkefølge må være et helt tall.' }

  const supabase = await createClient()
  if (id) {
    const { data, error } = await supabase
      .from('ledger_categories')
      .update({ name, account_no: accountNo, sort })
      .eq('id', id)
      .select('id')
    if (error) return { ok: false, error: error.code === '23505' ? 'Det finnes allerede en kategori med det navnet.' : dbErrorToMessage(error) }
    if (!data?.length) return { ok: false, error: 'Fant ikke kategorien.' }
  } else {
    const kind = text(form, 'kind')
    if (kind !== 'income' && kind !== 'expense') return { ok: false, error: 'Velg type.' }
    const { error } = await supabase.from('ledger_categories').insert({ kind, name, account_no: accountNo, sort })
    if (error) return { ok: false, error: error.code === '23505' ? 'Det finnes allerede en kategori med det navnet.' : dbErrorToMessage(error) }
  }
  refresh()
  return { ok: true }
}

export async function setCategoryActive(id: string, active: boolean): Promise<ActionResult> {
  await requireRole('owner')
  if (!UUID.test(id)) return { ok: false, error: 'Fant ikke kategorien.' }
  const supabase = await createClient()
  const { data, error } = await supabase.from('ledger_categories').update({ active }).eq('id', id).select('id')
  if (error) return { ok: false, error: dbErrorToMessage(error) }
  if (!data?.length) return { ok: false, error: 'Fant ikke kategorien.' }
  refresh()
  return { ok: true }
}
