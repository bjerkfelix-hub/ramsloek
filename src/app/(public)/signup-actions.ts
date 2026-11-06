'use server'

import { headers } from 'next/headers'
import { getDictionary, type Locale } from '@/content'
import { isValidEmail, normalizeEmail } from '@/lib/domain/email'
import { clientIp, createRateLimiter } from '@/lib/rate-limit'
import { createAdminClient } from '@/lib/supabase/admin'

export type SignupResult = { ok: true } | { ok: false; error: string }

// 5 attempts per IP per 10 minutes, kept in memory (one instance; resets on restart).
const limiter = createRateLimiter({ max: 5, windowMs: 10 * 60 * 1000 })

function field(form: FormData, key: string): string {
  const v = form.get(key)
  return typeof v === 'string' ? v : ''
}

export async function signUpForSeason(form: FormData): Promise<SignupResult> {
  const locale: Locale = field(form, 'language') === 'en' ? 'en' : 'no'
  const { signup } = getDictionary(locale)

  // Honeypot: bots fill every field. Pretend it worked, store nothing.
  if (field(form, 'website') !== '') return { ok: true }

  const ip = clientIp((await headers()).get('x-forwarded-for'))
  if (!limiter.attempt(ip)) return { ok: false, error: signup.errorTryLater }

  const raw = field(form, 'email')
  if (!isValidEmail(raw)) return { ok: false, error: signup.errorInvalidEmail }
  if (field(form, 'consent') !== 'on') return { ok: false, error: signup.errorNoConsent }
  const email = normalizeEmail(raw)

  try {
    const db = createAdminClient()
    const { data: existing, error: readError } = await db
      .from('season_signups')
      .select('id, unsubscribed_at')
      .eq('email', email)
      .maybeSingle()
    if (readError) throw readError

    if (!existing) {
      const { error } = await db
        .from('season_signups')
        .insert({ email, language: locale, consent_text: signup.consentText })
      // 23505: a concurrent sign-up with the same email won the race; that is a success too.
      if (error && error.code !== '23505') throw error
    } else if (existing.unsubscribed_at) {
      const { error } = await db
        .from('season_signups')
        .update({
          unsubscribed_at: null,
          language: locale,
          consent_text: signup.consentText,
          consented_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
      if (error) throw error
    }
    // Existing active sign-up: nothing to change, same success message (no enumeration).
    return { ok: true }
  } catch (e) {
    console.error('Season sign-up failed', e)
    return { ok: false, error: signup.errorGeneric }
  }
}

/** useActionState adapter: the form also works as a plain POST without JavaScript. */
export async function signUpAction(_prev: SignupResult | null, form: FormData): Promise<SignupResult> {
  return signUpForSeason(form)
}
