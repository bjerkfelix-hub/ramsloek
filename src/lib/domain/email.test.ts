import { describe, expect, it } from 'vitest'
import { isValidEmail, normalizeEmail } from './email'

describe('email', () => {
  it('normalizes', () => expect(normalizeEmail(' Ola@Eksempel.NO ')).toBe('ola@eksempel.no'))
  it('accepts valid', () => {
    expect(isValidEmail('a@b.no')).toBe(true)
    expect(isValidEmail(' Ola.Nordmann+ramslok@Eksempel.NO ')).toBe(true)
  })
  it.each(['', 'a@', '@b.no', 'a b@c.no', 'a@b', 'a@@b.no', `${'a'.repeat(300)}@b.no`])('rejects %j', (v) => {
    expect(isValidEmail(v)).toBe(false)
  })
})
