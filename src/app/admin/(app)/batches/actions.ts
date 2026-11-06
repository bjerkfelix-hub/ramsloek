'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { dbErrorToMessage } from '@/lib/errors'
import { createClient } from '@/lib/supabase/server'
import { text, textOrNull, type ActionResult } from '@/lib/action-result'
import { parseKgToGrams } from '@/lib/domain/weight'
import { isHarvestInFuture, osloLocalToIso } from '@/lib/domain/time'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function createBatch(form: FormData): Promise<ActionResult> {
  await requireRole('owner', 'picker')
  const id = text(form, 'id')
  if (!UUID.test(id)) return { ok: false, error: 'Noe gikk galt. Prøv igjen.' }
  const areaId = text(form, 'area_id')
  if (!UUID.test(areaId)) return { ok: false, error: 'Velg område.' }
  const harvestedAt = osloLocalToIso(text(form, 'harvested_at'))
  if (!harvestedAt) return { ok: false, error: 'Ugyldig tidspunkt.' }
  if (isHarvestInFuture(harvestedAt)) return { ok: false, error: 'Høstetidspunktet kan ikke være i fremtiden.' }
  const pickers = text(form, 'pickers')
  if (!pickers) return { ok: false, error: 'Skriv hvem som plukket.' }
  const grams = parseKgToGrams(text(form, 'gross_weight'))
  if (grams === null) return { ok: false, error: 'Skriv vekt i kg, f.eks. 2,5' }

  const supabase = await createClient()
  // A repeated submit (same id) must not burn another lot number, so skip the insert if it exists.
  const { data: existing } = await supabase.from('batches').select('id').eq('id', id).maybeSingle()
  if (!existing) {
    const { error } = await supabase.from('batches').upsert(
      {
        id,
        area_id: areaId,
        harvested_at: harvestedAt,
        pickers,
        gross_weight_g: grams,
        notes: textOrNull(form, 'notes'),
      },
      { onConflict: 'id', ignoreDuplicates: true },
    )
    if (error) return { ok: false, error: dbErrorToMessage(error) }
  }
  revalidatePath('/admin/batches')
  redirect(`/admin/batches/${id}`)
}

// Owner-only correction of gross weight and notes; the database refuses weights below what is already used.
export async function updateBatch(form: FormData): Promise<ActionResult> {
  await requireRole('owner')
  const batchId = text(form, 'batch_id')
  if (!UUID.test(batchId)) return { ok: false, error: 'Noe gikk galt. Prøv igjen.' }
  const grams = parseKgToGrams(text(form, 'gross_weight'))
  if (grams === null) return { ok: false, error: 'Skriv vekt i kg, f.eks. 2,5' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('batches')
    .update({ gross_weight_g: grams, notes: textOrNull(form, 'notes') })
    .eq('id', batchId)
    .select('id')
  if (error) return { ok: false, error: dbErrorToMessage(error) }
  if (!data?.length) return { ok: false, error: 'Fant ikke partiet.' }
  revalidatePath(`/admin/batches/${batchId}`)
  revalidatePath('/admin/batches')
  return { ok: true }
}

export async function signSortingCheck(batchId: string): Promise<ActionResult> {
  await requireRole('owner', 'picker')
  const supabase = await createClient()
  const { error } = await supabase.from('sorting_checks').insert({ batch_id: batchId })
  // Already signed (e.g. a second tap) is fine.
  if (error && error.code !== '23505') return { ok: false, error: dbErrorToMessage(error) }
  revalidatePath(`/admin/batches/${batchId}`)
  revalidatePath('/admin/batches')
  return { ok: true }
}

export async function logTemperature(batchId: string, celsius: string): Promise<ActionResult> {
  await requireRole('owner', 'picker')
  const normalized = celsius.trim().replace(',', '.')
  const value = /^-?\d+(\.\d+)?$/.test(normalized) ? Number(normalized) : NaN
  if (!Number.isFinite(value) || value < -30 || value > 50) {
    return { ok: false, error: 'Skriv temperatur mellom -30 og 50, f.eks. 3,5' }
  }
  const supabase = await createClient()
  const { error } = await supabase
    .from('temperature_logs')
    .insert({ batch_id: batchId, celsius: Math.round(value * 10) / 10 })
  if (error) return { ok: false, error: dbErrorToMessage(error) }
  revalidatePath(`/admin/batches/${batchId}`)
  return { ok: true }
}

const REASONS = ['visnet', 'skadet', 'utgått', 'annet']
const GENERIC = 'Noe gikk galt. Prøv igjen.'

function parseUnits(raw: string): number | null {
  if (!/^\d{1,6}$/.test(raw)) return null
  const n = Number(raw)
  return n > 0 ? n : null
}

export async function packBatch(
  form: FormData,
): Promise<{ ok: true; packingId: string } | { ok: false; error: string }> {
  await requireRole('owner', 'picker')
  const id = text(form, 'id')
  const batchId = text(form, 'batch_id')
  const productId = text(form, 'product_id')
  if (!UUID.test(id) || !UUID.test(batchId)) return { ok: false, error: GENERIC }
  if (!UUID.test(productId)) return { ok: false, error: 'Velg produkt.' }
  const units = parseUnits(text(form, 'units'))
  if (units === null) return { ok: false, error: 'Skriv antall som et helt tall, f.eks. 10' }

  const supabase = await createClient()
  // weight_g and best_before are derived by the database trigger. A repeated submit (same id) is a no-op.
  const { data: existing } = await supabase.from('packings').select('id').eq('id', id).maybeSingle()
  if (!existing) {
    const { error } = await supabase.from('packings').insert({ id, batch_id: batchId, product_id: productId, units })
    if (error && error.code !== '23505') return { ok: false, error: dbErrorToMessage(error) }
  }
  revalidatePath(`/admin/batches/${batchId}`)
  revalidatePath('/admin/stock')
  return { ok: true, packingId: id }
}

export async function registerWaste(form: FormData): Promise<ActionResult> {
  await requireRole('owner', 'picker')
  const id = text(form, 'id')
  const batchId = text(form, 'batch_id')
  if (!UUID.test(id) || !UUID.test(batchId)) return { ok: false, error: GENERIC }
  const reason = text(form, 'reason')
  if (!REASONS.includes(reason)) return { ok: false, error: 'Velg årsak.' }

  const weightText = text(form, 'weight')
  let row: Record<string, unknown>
  if (weightText) {
    const grams = parseKgToGrams(weightText)
    if (grams === null) return { ok: false, error: 'Skriv vekt i kg, f.eks. 0,5' }
    row = { weight_g: grams }
  } else {
    const productId = text(form, 'product_id')
    if (!UUID.test(productId)) return { ok: false, error: 'Velg produkt.' }
    const units = parseUnits(text(form, 'units'))
    if (units === null) return { ok: false, error: 'Skriv antall som et helt tall, f.eks. 2' }
    row = { product_id: productId, units }
  }

  const supabase = await createClient()
  const { data: existing } = await supabase.from('waste_records').select('id').eq('id', id).maybeSingle()
  if (!existing) {
    const { error } = await supabase
      .from('waste_records')
      .insert({ id, batch_id: batchId, reason, note: textOrNull(form, 'note'), ...row })
    if (error && error.code !== '23505') return { ok: false, error: dbErrorToMessage(error) }
  }
  revalidatePath(`/admin/batches/${batchId}`)
  revalidatePath('/admin/stock')
  return { ok: true }
}
