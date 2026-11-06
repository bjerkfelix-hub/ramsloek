'use server'

import { cookies } from 'next/headers'
import { requireRole } from '@/lib/auth'
import type { ActionResult } from '@/lib/action-result'
import { THEME_COOKIE, THEME_COOKIE_OPTIONS, THEME_PREFS, type ThemePref } from './theme'

// Stores the appearance preference (System / Lys / Mørk) for any signed-in role.
export async function setTheme(pref: ThemePref): Promise<ActionResult> {
  await requireRole('owner', 'picker', 'seller')
  if (!THEME_PREFS.includes(pref)) return { ok: false, error: 'Ugyldig valg.' }
  ;(await cookies()).set(THEME_COOKIE, pref, {
    ...THEME_COOKIE_OPTIONS,
    secure: process.env.NODE_ENV === 'production',
  })
  return { ok: true }
}
