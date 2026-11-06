import { describe, expect, it } from 'vitest'
import { osloLocalToIso } from './time'

describe('osloLocalToIso', () => {
  it('uses +01:00 in winter', () => {
    expect(osloLocalToIso('2026-11-06T14:30')).toBe('2026-11-06T13:30:00.000Z')
  })
  it('uses +02:00 in summer', () => {
    expect(osloLocalToIso('2026-05-06T14:30')).toBe('2026-05-06T12:30:00.000Z')
  })
  it('rejects garbage', () => {
    expect(osloLocalToIso('')).toBeNull()
    expect(osloLocalToIso('nope')).toBeNull()
  })
})
