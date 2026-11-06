import { describe, expect, it } from 'vitest'
import { formatMarketDate, formatMarketTimes, validateMarketDay } from './market'

const ok = { date: '2027-05-09', starts: '10:00', ends: '15:00', place: 'Torget', address: 'Torget 1' }

describe('market', () => {
  it('formats date and times', () => {
    expect(formatMarketDate('2027-05-09')).toBe('søndag 9. mai 2027')
    expect(formatMarketTimes('10:00:00', '15:00:00')).toBe('10:00–15:00')
  })
  it('validates', () => {
    expect(validateMarketDay(ok)).toBeNull()
    expect(validateMarketDay({ ...ok, ends: '' })).toBe('Fyll inn dato, tid, sted og adresse.')
    expect(validateMarketDay({ ...ok, place: '' })).toBe('Fyll inn dato, tid, sted og adresse.')
    expect(validateMarketDay({ ...ok, ends: '10:00' })).toBe('Sluttid må være etter starttid.')
    expect(validateMarketDay({ ...ok, ends: '09:00' })).toBe('Sluttid må være etter starttid.')
  })
})
