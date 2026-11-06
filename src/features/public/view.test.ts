import { describe, expect, it } from 'vitest'
import { getDictionary } from '@/content'
import type { MarketDay } from '@/lib/domain/season'
import {
  calendarView,
  formatClock,
  formatPublicDate,
  formatPublicTime,
  mapUrl,
  marketNote,
  seasonBannerText,
  seasonFromResult,
} from './view'

function day(date: string, over: Partial<MarketDay> = {}): MarketDay {
  return {
    id: date,
    marketDate: date,
    startsAt: '10:00',
    endsAt: '15:00',
    placeName: 'Bondens marked Vinkelplassen',
    address: 'Vinkelplassen, 0365 Oslo',
    noteNo: 'Ved fontenen',
    noteEn: 'By the fountain',
    cancelled: false,
    ...over,
  }
}

const no = getDictionary('no')
const en = getDictionary('en')
const TODAY = '2027-05-01'

describe('formatting', () => {
  it('formats market dates per locale', () => {
    expect(formatPublicDate('2027-05-08', 'no')).toBe('lørdag 8. mai')
    expect(formatPublicDate('2027-05-09', 'en')).toBe('Sunday 9 May')
  })
  it('drops zero minutes from times', () => {
    expect(formatClock('10:00')).toBe('10')
    expect(formatClock('10:30:00')).toBe('10:30')
    expect(formatPublicTime(day('2027-05-08'), 'no')).toBe('kl. 10–15')
    expect(formatPublicTime(day('2027-05-08', { endsAt: '15:30' }), 'en')).toBe('10–15:30')
  })
  it('builds a Google Maps search link for the address', () => {
    expect(mapUrl('Vinkelplassen, 0365 Oslo')).toBe(
      'https://www.google.com/maps/search/?api=1&query=Vinkelplassen%2C%200365%20Oslo',
    )
  })
  it('picks the note in the page language', () => {
    expect(marketNote(day('2027-05-08'), 'no')).toBe('Ved fontenen')
    expect(marketNote(day('2027-05-08'), 'en')).toBe('By the fountain')
    expect(marketNote(day('2027-05-08', { noteEn: null }), 'en')).toBeNull()
  })
})

describe('calendarView', () => {
  it('shows the load-failure text when market days could not be loaded', () => {
    expect(calendarView({ ok: false }, no)).toEqual({ kind: 'failed', message: 'Markedsdagene kunne ikke lastes akkurat nå' })
    expect(calendarView({ ok: false }, en)).toEqual({ kind: 'failed', message: 'Market days could not be loaded right now' })
  })
  it('shows the empty text when there are no upcoming days', () => {
    expect(calendarView({ ok: true, days: [] }, no)).toEqual({ kind: 'empty', message: no.markets.empty })
  })
  it('lists at most `limit` days, cancelled ones included', () => {
    const days = [day('2027-05-02', { cancelled: true }), day('2027-05-08'), day('2027-05-15'), day('2027-05-22')]
    expect(calendarView({ ok: true, days }, no, 3)).toEqual({ kind: 'list', days: days.slice(0, 3) })
  })
})

describe('season banner', () => {
  it('falls back to off_season when market days could not be loaded', () => {
    expect(seasonFromResult({ ok: false }, TODAY)).toEqual({ kind: 'off_season' })
  })
  it('uses the season rules when market days loaded', () => {
    const d = day('2027-05-08')
    expect(seasonFromResult({ ok: true, days: [d] }, TODAY)).toEqual({ kind: 'in_season', next: d })
  })
  it('in season names the next market', () => {
    const next = day('2027-05-08')
    expect(seasonBannerText({ kind: 'in_season', next }, 'no')).toEqual({
      text: 'I sesong – neste marked: lørdag 8. mai, Bondens marked Vinkelplassen',
      signUp: false,
    })
    expect(seasonBannerText({ kind: 'in_season', next }, 'en').text).toBe(
      'In season – next market: Saturday 8 May, Bondens marked Vinkelplassen',
    )
  })
  it('soon names the month the season starts', () => {
    const next = day('2028-04-22')
    expect(seasonBannerText({ kind: 'soon', next }, 'no')).toEqual({ text: 'Sesongen starter i april', signUp: true })
    expect(seasonBannerText({ kind: 'soon', next }, 'en')).toEqual({ text: 'The season starts in April', signUp: true })
  })
  it('off season points to spring', () => {
    expect(seasonBannerText({ kind: 'off_season' }, 'no')).toEqual({ text: 'Sesongen starter til våren', signUp: true })
    expect(seasonBannerText({ kind: 'off_season' }, 'en')).toEqual({ text: 'The season starts in spring', signUp: true })
  })
})
