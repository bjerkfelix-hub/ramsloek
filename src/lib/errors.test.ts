import { describe, expect, it } from 'vitest'
import { dbErrorToMessage } from './errors'

describe('dbErrorToMessage', () => {
  it.each([
    ['PLANNING_NO_DELETE', 'Registreringer kan ikke slettes. Avlys vakten eller arkiver oppgaven.'],
    ['PLANNING_IMMUTABLE', 'Dette feltet kan ikke endres.'],
    ['PLANNING_NOT_FOUND', 'Fant ikke registreringen.'],
    ['PLANNING_STALE', 'Registreringen er endret. Last inn på nytt og kontroller tidspunktene.'],
    ['PLANNING_PERIOD', 'Velg en gyldig periode på høyst 366 dager.'],
    ['PLANNING_INACTIVE_PERSON', 'Velg en aktiv person.'],
    ['PLANNING_LOCAL_TIME', 'Tidspunktet er ugyldig eller tvetydig ved overgang til sommer- eller vintertid. Velg et annet tidspunkt.'],
    ['PLANNING_WEEK', 'Velg en mandag som ukestart.'],
    ['SHIFT_INTERVAL', 'Vakten må slutte etter start, senest neste dag og innen 26 timer.'],
    ['SHIFT_OVERLAP', 'Personen har allerede en vakt i dette tidsrommet.'],
    ['SHIFT_CANCEL_REASON', 'Skriv en grunn for avlysningen (minst 3 tegn).'],
    ['SHIFT_CANCELLED', 'Vakten er avlyst og kan ikke endres.'],
    ['SHIFT_HAS_TIME', 'Vakten har registrerte timer. Avlys den og opprett en ny for å bytte person.'],
    ['TIME_ALREADY_OPEN', 'Du er allerede stemplet inn.'],
    ['TIME_OVERLAP', 'Tidsrommet overlapper andre registrerte timer.'],
    ['TIME_INTERVAL', 'Slutt må være lik eller etter start, og tidspunktene kan ikke være i fremtiden.'],
    ['TIME_REASON', 'Skriv en grunn for korrigeringen (minst 3 tegn).'],
    ['TIME_RATE', 'Bare en manglende timesats kan fylles inn. Sett gjeldende sats på Brukere først.'],
    ['RATE_INVALID', 'Skriv timesatsen i kroner, fra 0 til 10 000, med høyst to desimaler.'],
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
    ['LEDGER_CATEGORY_SYSTEM', 'Denne kategorien brukes av dagsoppgjør og kan ikke skrus av.'],
    ['LEDGER_SETTLE_INVALID', 'Bare ubetalte regninger og utlegg kan markeres som oppgjort.'],
  ])('maps %s', (message, expected) => {
    expect(dbErrorToMessage({ code: 'P0001', message })).toBe(expected)
  })
  it.each([
    ['23505', 'time_entries_one_open', 'Du er allerede stemplet inn.'],
    ['23P01', 'time_entries_no_overlap', 'Tidsrommet overlapper andre registrerte timer.'],
    ['23505', 'time_entries_start_key_unique', 'Dette finnes allerede.'],
    ['23505', 'time_entries_one_open_other', 'Dette finnes allerede.'],
    ['23P01', 'time_entries_no_overlap_other', 'Noe gikk galt. Prøv igjen.'],
  ])('maps %s constraint %s contextually', (code, constraint, expected) => {
    expect(dbErrorToMessage({ code, message: `violates constraint "${constraint}"` })).toBe(expected)
  })
  it('maps only the named shift exclusion constraint', () => {
    expect(dbErrorToMessage({
      code: '23P01',
      message: 'conflicting key value violates exclusion constraint "work_shifts_no_overlap"',
    })).toBe('Personen har allerede en vakt i dette tidsrommet.')
  })
  it('does not map an unrelated exclusion constraint to a shift error', () => {
    expect(dbErrorToMessage({
      code: '23P01',
      message: 'conflicting key value violates exclusion constraint "other_no_overlap"',
    })).toBe('Noe gikk galt. Prøv igjen.')
  })
  it('requires the exact shift constraint name', () => {
    expect(dbErrorToMessage({
      code: '23P01',
      message: 'conflicting key value violates exclusion constraint "work_shifts_no_overlap_other"',
    })).toBe('Noe gikk galt. Prøv igjen.')
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
