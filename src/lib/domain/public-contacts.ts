import { isValidEmail, normalizeEmail } from './email'

export type ContactKind = 'interest' | 'wholesale'
export type ContactError =
  'errorRequired' | 'errorPhone' | 'errorBags' | 'errorLength' | 'errorInvalidEmail' | 'errorNoConsent'
export function formField(form: FormData, key: string): string {
  const value = form.get(key)
  return typeof value === 'string' ? value.trim() : ''
}
export function validateContact(form: FormData, kind: ContactKind): ContactError | null {
  const f = (key: string) => formField(form, key)
  const required =
    kind === 'interest' ? ['name', 'email', 'bags'] : ['company', 'contact_name', 'email', 'type', 'message']
  if (required.some((key) => !f(key))) return 'errorRequired'
  const limits =
    kind === 'interest'
      ? { name: 100, comment: 1000 }
      : { company: 100, contact_name: 100, weekly_quantity: 100, message: 2000 }
  if (Object.entries(limits).some(([key, max]) => f(key).length > max)) return 'errorLength'
  if (!isValidEmail(f('email'))) return 'errorInvalidEmail'
  if (f('phone') && !/^\+?[0-9 ()/.\-]{3,50}$/.test(f('phone'))) return 'errorPhone'
  if (kind === 'interest' && (!/^\d+$/.test(f('bags')) || Number(f('bags')) < 1 || Number(f('bags')) > 50))
    return 'errorBags'
  if (kind === 'wholesale' && !['restaurant', 'grossist', 'butikk', 'annet'].includes(f('type')))
    return 'errorRequired'
  if (f('consent') !== 'on') return 'errorNoConsent'
  return null
}
export function contactValues(form: FormData) {
  return { email: normalizeEmail(formField(form, 'email')), phone: formField(form, 'phone') }
}
