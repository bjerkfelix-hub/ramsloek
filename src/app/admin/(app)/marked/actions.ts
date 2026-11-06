'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth'
import { dbErrorToMessage } from '@/lib/errors'
import { createClient } from '@/lib/supabase/server'
import { text, textOrNull, type ActionResult } from '@/lib/action-result'
import { MARKET_TIME_ORDER, validateMarketDay } from '@/lib/domain/market'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function saveMarketDay(form: FormData): Promise<ActionResult> {
  await requireRole('owner')
  const id = text(form, 'id')
  if (id && !UUID.test(id)) return { ok: false, error: 'Ugyldig markedsdag.' }
  const input = {
    date: text(form, 'date'),
    starts: text(form, 'starts'),
    ends: text(form, 'ends'),
    place: text(form, 'place'),
    address: text(form, 'address'),
  }
  const invalid = validateMarketDay(input)
  if (invalid) return { ok: false, error: invalid }

  const row = {
    market_date: input.date,
    starts_at: input.starts,
    ends_at: input.ends,
    place_name: input.place,
    address: input.address,
    note_no: textOrNull(form, 'note_no'),
    note_en: textOrNull(form, 'note_en'),
    published: form.get('published') === 'on',
  }
  const supabase = await createClient()
  if (id) {
    const { data, error } = await supabase.from('market_days').update(row).eq('id', id).select('id')
    if (error) return { ok: false, error: error.code === '23514' ? MARKET_TIME_ORDER : dbErrorToMessage(error) }
    if (!data?.length) return { ok: false, error: 'Fant ikke markedsdagen.' }
  } else {
    const { error } = await supabase.from('market_days').insert(row)
    if (error) return { ok: false, error: error.code === '23514' ? MARKET_TIME_ORDER : dbErrorToMessage(error) }
  }
  revalidatePath('/admin/marked')
  return { ok: true }
}

export async function setMarketDayCancelled(id: string, cancelled: boolean): Promise<ActionResult> {
  await requireRole('owner')
  if (!UUID.test(id)) return { ok: false, error: 'Ugyldig markedsdag.' }
  const supabase = await createClient()
  const { data, error } = await supabase.from('market_days').update({ cancelled }).eq('id', id).select('id')
  if (error) return { ok: false, error: dbErrorToMessage(error) }
  if (!data?.length) return { ok: false, error: 'Fant ikke markedsdagen.' }
  revalidatePath('/admin/marked')
  return { ok: true }
}
