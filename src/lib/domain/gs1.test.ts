import { describe, expect, it } from 'vitest'
import { ean13FromGtin, gs1CheckDigit, gs1_128Text, normalizeGtin } from '@/lib/domain/gs1'

describe('gs1CheckDigit', () => {
  it('computes the GS1 mod-10 check digit', () => {
    expect(gs1CheckDigit('703801005569')).toBe(0)
    expect(gs1CheckDigit('1703801005570')).toBe(3)
  })
})

describe('normalizeGtin', () => {
  it('pads a 13-digit GTIN to 14 digits when the check digit is valid', () => {
    expect(normalizeGtin('7038010055690')).toBe('07038010055690')
  })

  it('ignores spaces', () => {
    expect(normalizeGtin('703 8010 05569 0')).toBe('07038010055690')
  })

  it('keeps a 14-digit GTIN as is', () => {
    expect(normalizeGtin('17038010055703')).toBe('17038010055703')
  })

  it('rejects a wrong check digit', () => {
    expect(normalizeGtin('7038010055691')).toBeNull()
  })

  it('rejects an unsupported length', () => {
    expect(normalizeGtin('70380100556')).toBeNull()
  })

  it('rejects non-digit input', () => {
    expect(normalizeGtin('abc')).toBeNull()
  })
})

describe('ean13FromGtin', () => {
  it('strips the leading zero of a GTIN-14', () => {
    expect(ean13FromGtin('07038010055690')).toBe('7038010055690')
  })

  it('returns null when the GTIN-14 has no leading zero', () => {
    expect(ean13FromGtin('17038010055703')).toBeNull()
  })
})

describe('gs1_128Text', () => {
  it('builds the bracketed GS1-128 element string', () => {
    expect(
      gs1_128Text({ gtin14: '17038010055703', bestBefore: '2027-05-20', lot: 'RL-27-014' }),
    ).toBe('(01)17038010055703(15)270520(10)RL-27-014')
  })
})
