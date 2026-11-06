'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth'
import { dbErrorToMessage } from '@/lib/errors'
import { createClient } from '@/lib/supabase/server'
import { text, type ActionResult } from '@/lib/action-result'

function coordinate(raw: string, min: number, max: number): number | null | undefined {
  if (!raw) return null
  const n = Number(raw.replace(',', '.'))
  return Number.isFinite(n) && n >= min && n <= max ? n : undefined
}

export async function saveArea(form: FormData): Promise<ActionResult> {
  await requireRole('owner')
  const id = text(form, 'id')
  const name = text(form, 'name')
  if (!name) return { ok: false, error: 'Navn må fylles ut.' }
  const lat = coordinate(text(form, 'lat'), -90, 90)
  const lng = coordinate(text(form, 'lng'), -180, 180)
  if (lat === undefined || lng === undefined) return { ok: false, error: 'Ugyldig posisjon.' }

  const row = { name, lat, lng, active: id ? form.get('active') === 'on' : true }
  const supabase = await createClient()
  const { error } = id
    ? await supabase.from('harvest_areas').update(row).eq('id', id)
    : await supabase.from('harvest_areas').insert(row)
  if (error) return { ok: false, error: dbErrorToMessage(error) }
  revalidatePath('/areas')
  return { ok: true }
}
