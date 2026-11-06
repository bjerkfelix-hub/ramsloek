'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth'
import { dbErrorToMessage } from '@/lib/errors'
import { createClient } from '@/lib/supabase/server'
import { text, textOrNull, type ActionResult } from '@/lib/action-result'

export async function saveSettings(form: FormData): Promise<ActionResult> {
  await requireRole('owner')
  const lotPrefix = text(form, 'lot_prefix')
  const warning = Number(text(form, 'best_before_warning_days'))
  if (!lotPrefix) return { ok: false, error: 'Partiprefiks må fylles ut.' }
  if (!Number.isInteger(warning) || warning < 0) return { ok: false, error: 'Ugyldig antall dager for advarsel.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('settings')
    .update({
      company_name: textOrNull(form, 'company_name'),
      org_nr: textOrNull(form, 'org_nr'),
      address: textOrNull(form, 'address'),
      gs1_company_prefix: textOrNull(form, 'gs1_company_prefix'),
      lot_prefix: lotPrefix,
      best_before_warning_days: warning,
    })
    .eq('id', true)
  if (error) return { ok: false, error: dbErrorToMessage(error) }
  revalidatePath('/settings')
  return { ok: true }
}
