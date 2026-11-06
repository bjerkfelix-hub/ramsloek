'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth'
import { dbErrorToMessage } from '@/lib/errors'
import { normalizeGtin } from '@/lib/domain/gs1'
import { createClient } from '@/lib/supabase/server'
import { text, type ActionResult } from '@/lib/action-result'

export async function saveProduct(form: FormData): Promise<ActionResult> {
  await requireRole('owner')
  const id = text(form, 'id')
  const name = text(form, 'name')
  if (!name) return { ok: false, error: 'Navn må fylles ut.' }

  const netWeight = Number(text(form, 'net_weight_g'))
  if (!Number.isInteger(netWeight) || netWeight <= 0) return { ok: false, error: 'Nettovekt må være et helt tall i gram.' }
  const shelfLife = Number(text(form, 'shelf_life_days'))
  if (!Number.isInteger(shelfLife) || shelfLife < 1 || shelfLife > 60) {
    return { ok: false, error: 'Holdbarhet må være mellom 1 og 60 dager.' }
  }
  const unitKind = text(form, 'unit_kind')
  if (unitKind !== 'consumer' && unitKind !== 'trade') return { ok: false, error: 'Velg type.' }

  const rawGtin = text(form, 'gtin')
  let gtin: string | null = null
  if (rawGtin) {
    gtin = normalizeGtin(rawGtin)
    if (!gtin) return { ok: false, error: 'Ugyldig GTIN (feil kontrollsiffer).' }
  }

  const row = {
    name,
    net_weight_g: netWeight,
    unit_kind: unitKind,
    gtin,
    shelf_life_days: shelfLife,
    storage_text: text(form, 'storage_text') || 'Oppbevares kjølig',
    active: id ? form.get('active') === 'on' : true,
  }
  const supabase = await createClient()
  const { error } = id
    ? await supabase.from('products').update(row).eq('id', id)
    : await supabase.from('products').insert(row)
  if (error) return { ok: false, error: dbErrorToMessage(error) }
  revalidatePath('/products')
  return { ok: true }
}
