'use server'

import { headers } from 'next/headers'
import { getDictionary, type Locale } from '@/content'
import { formField, contactValues, validateContact, type ContactKind } from '@/lib/domain/public-contacts'
import { clientIp, createRateLimiter } from '@/lib/rate-limit'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyInquiry } from '@/lib/server/inquiry-email'
import type { SignupResult } from './signup-actions'

const limiter = createRateLimiter({ max: 5, windowMs: 10 * 60 * 1000 })
async function submitContact(kind: ContactKind, form: FormData): Promise<SignupResult> {
  const f = (key: string) => formField(form, key)
  const locale: Locale = f('language') === 'en' ? 'en' : 'no'
  const dict = getDictionary(locale)
  // As with season signup, quietly discard bot submissions before validation and rate limiting.
  const honeypot = form.get('hp_extra_field')
  if (typeof honeypot === 'string' && honeypot !== '') return { ok: true }
  if (!limiter.attempt(clientIp(await headers()))) return { ok: false, error: dict.signup.errorTryLater }
  const error = validateContact(form, kind)
  if (error)
    return {
      ok: false,
      error:
        error === 'errorInvalidEmail' || error === 'errorNoConsent'
          ? dict.signup[error]
          : dict.contactForm[error],
    }
  const common = {
    ...contactValues(form),
    language: locale,
    consent_text: dict[kind].consentText,
    consented_at: new Date().toISOString(),
  }
  try {
    const db = createAdminClient()
    if (kind === 'interest') {
      const { error } = await db
        .from('consumer_interests')
        .upsert(
          { ...common, name: f('name'), bags: Number(f('bags')), comment: f('comment') },
          { onConflict: 'email' },
        )
      if (error) throw error
    } else {
      const inquiry = {
        ...common,
        company: f('company'),
        contact_name: f('contact_name'),
        type: f('type'),
        weekly_quantity: f('weekly_quantity'),
        message: f('message'),
      }
      const { error } = await db.from('business_inquiries').insert(inquiry)
      if (error) throw error
      await notifyInquiry(inquiry)
    }
    return { ok: true }
  } catch {
    console.warn('Public contact could not be saved')
    return { ok: false, error: dict.signup.errorGeneric }
  }
}
export async function interestAction(_prev: SignupResult | null, form: FormData): Promise<SignupResult> {
  return submitContact('interest', form)
}
export async function inquiryAction(_prev: SignupResult | null, form: FormData): Promise<SignupResult> {
  return submitContact('wholesale', form)
}
