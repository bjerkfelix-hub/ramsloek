import { describe, expect, it } from 'vitest'
import { formatGrams, parseKgToGrams } from '@/lib/domain/weight'

describe('parseKgToGrams', () => {
  it('accepts a decimal comma as typed on Norwegian phones', () => {
    expect(parseKgToGrams('2,5')).toBe(2500)
  })

  it('accepts a decimal point', () => {
    expect(parseKgToGrams('2.5')).toBe(2500)
  })

  it('trims surrounding whitespace', () => {
    expect(parseKgToGrams(' 12 ')).toBe(12000)
  })

  it('accepts a trailing kg unit', () => {
    expect(parseKgToGrams('2,5 kg')).toBe(2500)
  })

  it('handles sub-100 g values', () => {
    expect(parseKgToGrams('0,125')).toBe(125)
  })

  it('rejects zero', () => {
    expect(parseKgToGrams('0')).toBeNull()
  })

  it('rejects negative values', () => {
    expect(parseKgToGrams('-1')).toBeNull()
  })

  it('rejects empty input', () => {
    expect(parseKgToGrams('')).toBeNull()
  })

  it('rejects multiple decimal separators', () => {
    expect(parseKgToGrams('1,2,3')).toBeNull()
  })

  it('rejects values that round to zero grams', () => {
    expect(parseKgToGrams('0,0001')).toBeNull()
  })
})

describe('formatGrams', () => {
  it('formats kilograms with a Norwegian decimal comma', () => {
    expect(formatGrams(2500)).toBe('2,5 kg')
  })

  it('omits the decimal when it is whole kilograms', () => {
    expect(formatGrams(12000)).toBe('12 kg')
  })

  it('formats values under 1 kg in grams', () => {
    expect(formatGrams(100)).toBe('100 g')
  })
})
