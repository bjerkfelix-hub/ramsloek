import { describe, expect, it } from 'vitest'
import { SEASON_WINDOW_DAYS, seasonStatus, type MarketDay } from './season'

function day(date: string, over: Partial<MarketDay> = {}): MarketDay {
  return {
    id: date,
    marketDate: date,
    startsAt: '10:00',
    endsAt: '16:00',
    placeName: 'Bondens marked',
    address: 'Vinkelplassen, Oslo',
    noteNo: null,
    noteEn: null,
    cancelled: false,
    ...over,
  }
}

const TODAY = '2027-04-20'

describe('seasonStatus', () => {
  it('window is 14 days', () => expect(SEASON_WINDOW_DAYS).toBe(14))
  it('no days -> off_season', () => expect(seasonStatus([], TODAY)).toEqual({ kind: 'off_season' }))
  it('only cancelled -> off_season', () => {
    expect(seasonStatus([day('2027-04-21', { cancelled: true })], TODAY)).toEqual({ kind: 'off_season' })
  })
  it('market today -> in_season', () => {
    const d = day(TODAY)
    expect(seasonStatus([d], TODAY)).toEqual({ kind: 'in_season', next: d })
  })
  it('market in exactly 14 days -> in_season', () => {
    expect(seasonStatus([day('2027-05-04')], TODAY).kind).toBe('in_season')
  })
  it('market in 15 days -> soon', () => {
    expect(seasonStatus([day('2027-05-05')], TODAY).kind).toBe('soon')
  })
  it('crosses month and year boundaries', () => {
    expect(seasonStatus([day('2028-01-14')], '2027-12-31').kind).toBe('in_season')
    expect(seasonStatus([day('2028-01-15')], '2027-12-31').kind).toBe('soon')
  })
  it('ignores past days', () => {
    expect(seasonStatus([day('2027-04-19')], TODAY)).toEqual({ kind: 'off_season' })
  })
  it('picks the earliest non-cancelled upcoming day regardless of input order', () => {
    const early = day('2027-04-22')
    const status = seasonStatus(
      [day('2027-04-29'), day('2027-04-21', { cancelled: true }), early, day('2027-04-10')],
      TODAY,
    )
    expect(status).toEqual({ kind: 'in_season', next: early })
  })
})
