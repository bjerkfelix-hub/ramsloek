import { describe, expect, it } from 'vitest'
import { dbErrorToMessage } from './errors'

describe('dbErrorToMessage', () => {
  it.each([
    ['TAKINGS_FUTURE_DAY', 'Markedsdagen har ikke vært ennå.'],
    ['TAKINGS_CANCELLED_DAY', 'Markedsdagen er avlyst.'],
    ['TAKINGS_EMPTY', 'Fyll inn minst ett beløp.'],
    ['RECEIPT_PARENT_INVALID', 'Du kan bare legge kvittering på dine egne poster.'],
    ['LEDGER_NO_DELETE', 'Poster og kvitteringer kan ikke slettes. Annuller i stedet.'],
    ['LEDGER_IMMUTABLE', 'Dette feltet kan ikke endres.'],
    ['LEDGER_VOIDED', 'Posten er annullert og kan ikke endres.'],
    ['LEDGER_FUTURE_DATE', 'Datoen kan ikke være i fremtiden.'],
    ['LEDGER_CATEGORY_MISMATCH', 'Kategorien passer ikke til typen post.'],
    ['LEDGER_CATEGORY_INACTIVE', 'Kategorien er ikke i bruk lenger.'],
    ['LEDGER_INCOME_VIA_TAKINGS', 'Inntekt fra marked registreres som dagsoppgjør.'],
    ['LEDGER_VOID_REASON', 'Skriv en grunn for annulleringen.'],
    ['LEDGER_SETTLE_INVALID', 'Bare ubetalte regninger og utlegg kan markeres som oppgjort.'],
  ])('maps %s', (message, expected) => {
    expect(dbErrorToMessage({ code: 'P0001', message })).toBe(expected)
  })
  it('maps sorting check missing', () => {
    expect(dbErrorToMessage({ message: 'SORTING_CHECK_MISSING' })).toBe('Partiet må sorteringskontrolleres før pakking.')
  })
  it('maps not enough left in batch', () => {
    expect(dbErrorToMessage({ message: 'NOT_ENOUGH_LEFT' })).toBe('Det er ikke nok igjen av partiet.')
  })
  it('maps negative stock', () => {
    expect(dbErrorToMessage({ message: 'STOCK_NEGATIVE' })).toBe('Det er ikke nok på lager.')
  })
  it('maps weight below used', () => {
    expect(dbErrorToMessage({ message: 'WEIGHT_BELOW_USED' })).toBe(
      'Vekten kan ikke være mindre enn det som allerede er pakket eller kastet.',
    )
  })
  it('maps future time', () => {
    expect(dbErrorToMessage({ message: 'FUTURE_TIME' })).toBe('Tidspunktet kan ikke være i fremtiden.')
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
