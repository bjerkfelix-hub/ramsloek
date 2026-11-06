import { describe, expect, it } from 'vitest'
import { isExpired, isHarvestInFuture, osloLocalToIso, todayOslo } from './time'

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

describe('todayOslo / isExpired', () => {
  it('uses the Oslo calendar date', () => {
    // 23:30 UTC on 20 April is already 21 April in Oslo (summer time)
    expect(todayOslo(new Date('2027-04-20T23:30:00Z'))).toBe('2027-04-21')
  })
  it('is expired only when strictly before today', () => {
    const now = new Date('2027-04-21T10:00:00Z')
    expect(isExpired('2027-04-20', now)).toBe(true)
    expect(isExpired('2027-04-21', now)).toBe(false)
    expect(isExpired('2027-04-22', now)).toBe(false)
  })
})

describe('isHarvestInFuture', () => {
  const now = Date.parse('2027-04-21T10:00:00Z')
  it('allows now and up to one day ahead', () => {
    expect(isHarvestInFuture('2027-04-21T09:00:00Z', now)).toBe(false)
    expect(isHarvestInFuture('2027-04-22T10:00:00Z', now)).toBe(false)
  })
  it('rejects more than a day ahead', () => {
    expect(isHarvestInFuture('2027-04-22T10:01:00Z', now)).toBe(true)
  })
})
