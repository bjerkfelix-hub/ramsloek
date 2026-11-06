'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth'
import { dbErrorToMessage } from '@/lib/errors'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { text, type ActionResult } from '@/lib/action-result'

const ROLES = ['owner', 'picker', 'seller']

export async function inviteUser(form: FormData): Promise<ActionResult> {
  await requireRole('owner')
  const email = text(form, 'email').toLowerCase()
  const fullName = text(form, 'full_name')
  const role = text(form, 'role')
  if (!email || !fullName) return { ok: false, error: 'E-post og navn må fylles ut.' }
  if (!ROLES.includes(role)) return { ok: false, error: 'Velg en rolle.' }

  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host')
  const proto = h.get('x-forwarded-proto') ?? (host?.startsWith('localhost') ? 'http' : 'https')
  const { error } = await createAdminClient().auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName, role },
    redirectTo: `${proto}://${host}/auth/callback`,
  })
  if (error) {
    return { ok: false, error: /already|registered/i.test(error.message) ? 'Dette finnes allerede.' : 'Kunne ikke sende invitasjonen. Prøv igjen.' }
  }
  revalidatePath('/users')
  return { ok: true }
}

export async function setUserActive(userId: string, active: boolean): Promise<ActionResult> {
  const me = await requireRole('owner')
  if (userId === me.id) return { ok: false, error: 'Du kan ikke deaktivere deg selv.' }
  const supabase = await createClient()
  const { data, error } = await supabase.from('profiles').update({ active }).eq('id', userId).select('id')
  if (error) return { ok: false, error: dbErrorToMessage(error) }
  if (!data?.length) return { ok: false, error: 'Fant ikke brukeren.' }
  revalidatePath('/users')
  return { ok: true }
}
