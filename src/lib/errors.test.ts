import { describe, expect, it } from 'vitest'
import { dbErrorToMessage } from './errors'

describe('dbErrorToMessage', () => {
  it('maps sorting check missing', () => {
    expect(dbErrorToMessage({ message: 'SORTING_CHECK_MISSING' })).toBe('Partiet må sorteringskontrolleres før pakking.')
  })
  it('maps not enough left in batch', () => {
    expect(dbErrorToMessage({ message: 'NOT_ENOUGH_LEFT' })).toBe('Det er ikke nok igjen av partiet.')
  })
  it('maps negative stock', () => {
    expect(dbErrorToMessage({ message: 'STOCK_NEGATIVE' })).toBe('Det er ikke nok på lager.')
  })
  it('maps permission denied', () => {
    expect(dbErrorToMessage({ code: '42501' })).toBe('Du har ikke tilgang til dette.')
  })
  it('maps unique violation', () => {
    expect(dbErrorToMessage({ code: '23505' })).toBe('Dette finnes allerede.')
  })
  it('falls back to a generic message', () => {
    expect(dbErrorToMessage({ message: 'anything else' })).toBe('Noe gikk galt. Prøv igjen.')
  })
})
