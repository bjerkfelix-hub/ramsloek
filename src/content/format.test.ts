import { describe, expect, it } from 'vitest'
import { format } from './format'

describe('format', () => {
  it('replaces placeholders', () => {
    expect(format('Neste marked: {date}, {place}', { date: 'tirsdag 21. april', place: 'Vinkelplassen' })).toBe(
      'Neste marked: tirsdag 21. april, Vinkelplassen',
    )
  })
  it('replaces repeated placeholders', () => expect(format('{a}-{a}', { a: 'x' })).toBe('x-x'))
  it('leaves unknown placeholders untouched', () => expect(format('Hei {navn}', {})).toBe('Hei {navn}'))
  it('handles numbers', () => expect(format('{n} porsjoner', { n: 4 })).toBe('4 porsjoner'))
})
