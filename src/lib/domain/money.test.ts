import { describe, expect, it } from 'vitest'
import { formatKr, oreToKrNumber, parseKr } from './money'

describe('parseKr', () => {
  it.each([
    ['1234,50', 123450], ['1 234,50', 123450], ['1234.5', 123450],
    ['kr 300', 30000], ['300,-', 30000], [' 45 ', 4500],
    ['1\u00a0234,50', 123450], ['0,01', 1], ['0.29', 29],
    ['1000000', 100000000],
  ])('parses %j into %i øre', (input, expected) => {
    expect(parseKr(input)).toBe(expected)
  })

  it.each([
    '0', '-5', '12,345', '1.234,50', 'abc', '', '1000000,01',
    'NaN', 'Infinity', '1e3', '+5', '12,', 'kr', '300,-x', '1kr2',
  ])('rejects %j', (input) => {
    expect(parseKr(input)).toBeNull()
  })
})

describe('formatKr', () => {
  it('uses Norwegian grouping and exactly two decimals', () => {
    expect(formatKr(123450)).toMatch(/^kr 1\s234,50$/)
    expect(formatKr(0)).toBe('kr 0,00')
    expect(formatKr(-123)).toBe('kr −1,23')
  })
})

describe('oreToKrNumber', () => {
  it('returns numeric kroner for Excel', () => {
    expect(oreToKrNumber(123450)).toBe(1234.5)
    expect(oreToKrNumber(1)).toBe(0.01)
    expect(oreToKrNumber(0)).toBe(0)
  })
})
