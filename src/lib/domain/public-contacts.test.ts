import { describe, expect, it } from 'vitest'
import { contactValues, validateContact, type ContactKind } from './public-contacts'
function form(kind: ContactKind, values: Record<string, string> = {}) {
  const data = new FormData()
  const defaults = kind === 'interest' ? { name: 'Ola', bags: '3' } : { company: 'Kjøkkenet', contact_name: 'Ola', type: 'restaurant', message: 'Vi trenger ramsløk.' }
  for (const [key, value] of Object.entries({ ...defaults, email: ' Ola@Example.test ', phone: '', consent: 'on', ...values })) if (typeof value === 'string') data.set(key, value)
  return data
}
describe('public contact validation', () => {
  it.each(['interest', 'wholesale'] as const)('accepts %s and normalizes email', kind => {
    expect(validateContact(form(kind), kind)).toBeNull()
    expect(contactValues(form(kind)).email).toBe('ola@example.test')
  })
  it.each(['', '0', '51', '1.5', 'NaN', '1e1', '-1'])('rejects invalid bags %s', bags => expect(validateContact(form('interest', { bags }), 'interest')).not.toBeNull())
  it.each(['1', '50'])('accepts bag boundary %s', bags => expect(validateContact(form('interest', { bags }), 'interest')).toBeNull())
  it.each(['interest', 'wholesale'] as const)('requires valid email and consent for %s', kind => {
    expect(validateContact(form(kind, { email: 'bad' }), kind)).toBe('errorInvalidEmail')
    expect(validateContact(form(kind, { email: 'a@b.test\r\nBcc: x@y.test' }), kind)).toBe('errorInvalidEmail')
    expect(validateContact(form(kind, { consent: '' }), kind)).toBe('errorNoConsent')
    expect(validateContact(form(kind, { phone: '+47 (123) 45-678' }), kind)).toBeNull()
    expect(validateContact(form(kind, { phone: 'letters' }), kind)).toBe('errorPhone')
  })
  it.each([['interest', 'name', 100], ['interest', 'comment', 1000], ['wholesale', 'company', 100], ['wholesale', 'contact_name', 100], ['wholesale', 'weekly_quantity', 100], ['wholesale', 'message', 2000]] as const)('enforces %s %s max %s', (kind, key, max) => {
    expect(validateContact(form(kind, { [key]: 'x'.repeat(max) }), kind)).toBeNull()
    expect(validateContact(form(kind, { [key]: 'x'.repeat(max + 1) }), kind)).toBe('errorLength')
  })
  it('requires names, company, message and a recognized type', () => {
    expect(validateContact(form('interest', { name: ' ' }), 'interest')).toBe('errorRequired')
    for (const key of ['company', 'contact_name', 'message', 'type']) expect(validateContact(form('wholesale', { [key]: ' ' }), 'wholesale')).toBe('errorRequired')
    expect(validateContact(form('wholesale', { type: 'forged' }), 'wholesale')).toBe('errorRequired')
    for (const type of ['restaurant', 'grossist', 'butikk', 'annet']) expect(validateContact(form('wholesale', { type }), 'wholesale')).toBeNull()
  })
})
