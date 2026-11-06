'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { dbErrorToMessage } from '@/lib/errors'
import { createClient } from '@/lib/supabase/server'
import { text, textOrNull, type ActionResult } from '@/lib/action-result'
import { parseKgToGrams } from '@/lib/domain/weight'
import { osloLocalToIso } from '@/lib/domain/time'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function createBatch(form: FormData): Promise<ActionResult> {
  await requireRole('owner', 'picker')
  const id = text(form, 'id')
  if (!UUID.test(id)) return { ok: false, error: 'Noe gikk galt. Prøv igjen.' }
  const areaId = text(form, 'area_id')
  if (!UUID.test(areaId)) return { ok: false, error: 'Velg område.' }
  const harvestedAt = osloLocalToIso(text(form, 'harvested_at'))
  if (!harvestedAt) return { ok: false, error: 'Ugyldig tidspunkt.' }
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
  revalidatePath('/batches')
  redirect(`/batches/${id}`)
}

export async function signSortingCheck(batchId: string): Promise<ActionResult> {
  await requireRole('owner', 'picker')
  const supabase = await createClient()
  const { error } = await supabase.from('sorting_checks').insert({ batch_id: batchId })
  // Already signed (e.g. a second tap) is fine.
  if (error && error.code !== '23505') return { ok: false, error: dbErrorToMessage(error) }
  revalidatePath(`/batches/${batchId}`)
  revalidatePath('/batches')
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
  revalidatePath(`/batches/${batchId}`)
  return { ok: true }
}
