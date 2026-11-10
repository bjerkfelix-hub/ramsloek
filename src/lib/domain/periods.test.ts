import { describe, expect, it } from 'vitest'
import { monthKey, parsePeriod, presetPeriod, type PeriodPreset } from './periods'

describe('presetPeriod', () => {
  it.each<[PeriodPreset, string, string, string]>([
    ['this-month', '2027-03-15', '2027-03-01', '2027-03-31'],
    ['last-month', '2027-01-10', '2026-12-01', '2026-12-31'],
    ['this-year', '2027-03-15', '2027-01-01', '2027-12-31'],
    ['last-year', '2027-03-15', '2026-01-01', '2026-12-31'],
    ['this-month', '2028-02-15', '2028-02-01', '2028-02-29'],
    ['last-month', '2028-03-31', '2028-02-01', '2028-02-29'],
    ['this-month', '2027-10-31', '2027-10-01', '2027-10-31'],
  ])('%s on %s', (preset, today, from, to) => {
    expect(presetPeriod(preset, today)).toEqual({ from, to })
  })
})

describe('parsePeriod', () => {
  it.each<[string | null, string | null]>([
    ['2027-02-30', '2027-03-01'], ['2027-03-02', '2027-03-01'],
    ['2027-01-01', '2031-01-01'], [null, '2027-01-01'], ['2027-01-01', null],
    ['', ''], ['2027-13-01', '2028-01-01'], ['2027-1-01', '2027-02-01'],
    ['2027-02-01', '2027-02-29'], ['2027-01-01', '2030-01-02'],
    ['2028-02-29', '2031-03-01'],
  ])('rejects %j through %j', (from, to) => {
    expect(parsePeriod(from, to)).toBeNull()
  })

  it.each([
    ['2027-03-01', '2027-03-01'], ['2027-01-01', '2030-01-01'],
    ['2028-02-29', '2031-02-28'],
  ])('accepts %s through %s', (from, to) => {
    expect(parsePeriod(from, to)).toEqual({ from, to })
  })
})

describe('monthKey', () => {
  it('takes the month from a calendar date', () => {
    expect(monthKey('2027-03-31')).toBe('2027-03')
  })
})
