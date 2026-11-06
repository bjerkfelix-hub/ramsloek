import { format, getDictionary, type Dictionary, type Locale } from '@/content'
import { seasonStatus, type MarketDay, type SeasonStatus } from '@/lib/domain/season'
import type { MarketDaysResult } from '@/lib/public/market-days'

// Dates are Oslo calendar dates; format them at noon UTC so no time zone can shift the day.
const dateFormats: Record<Locale, Intl.DateTimeFormat> = {
  no: new Intl.DateTimeFormat('nb-NO', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }),
  en: new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }),
}
const monthFormats: Record<Locale, Intl.DateTimeFormat> = {
  no: new Intl.DateTimeFormat('nb-NO', { timeZone: 'UTC', month: 'long' }),
  en: new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', month: 'long' }),
}

const atNoon = (ymd: string) => new Date(`${ymd}T12:00:00Z`)

/** "2027-05-08" -> "lørdag 8. mai" / "Saturday 8 May". */
export function formatPublicDate(ymd: string, locale: Locale): string {
  return dateFormats[locale].format(atNoon(ymd))
}

/** "10:00" -> "10", "10:30:00" -> "10:30". */
export function formatClock(time: string): string {
  const hhmm = time.slice(0, 5)
  const [h, m] = hhmm.split(':')
  return m === '00' ? String(Number(h)) : `${Number(h)}:${m}`
}

/** "kl. 10–15" / "10–15". */
export function formatPublicTime(day: MarketDay, locale: Locale): string {
  return format(getDictionary(locale).markets.time, { start: formatClock(day.startsAt), end: formatClock(day.endsAt) })
}

export function mapUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}

export function marketNote(day: MarketDay, locale: Locale): string | null {
  return (locale === 'en' ? day.noteEn : day.noteNo) || null
}

export type CalendarView =
  | { kind: 'failed'; message: string }
  | { kind: 'empty'; message: string }
  | { kind: 'list'; days: MarketDay[] }

/** What the market calendar section shows for a load result. */
export function calendarView(result: MarketDaysResult, dict: Dictionary, limit?: number): CalendarView {
  if (!result.ok) return { kind: 'failed', message: dict.markets.loadFailed }
  if (result.days.length === 0) return { kind: 'empty', message: dict.markets.empty }
  return { kind: 'list', days: limit === undefined ? result.days : result.days.slice(0, limit) }
}

/** Season status; falls back to off-season (the sign-up variant) when market days could not be loaded. */
export function seasonFromResult(result: MarketDaysResult, today: string): SeasonStatus {
  return result.ok ? seasonStatus(result.days, today) : { kind: 'off_season' }
}

/** Banner text, and whether to point visitors to the season sign-up. */
export function seasonBannerText(status: SeasonStatus, locale: Locale): { text: string; signUp: boolean } {
  const { season } = getDictionary(locale)
  switch (status.kind) {
    case 'in_season':
      return {
        text: format(season.inSeason, { date: formatPublicDate(status.next.marketDate, locale), place: status.next.placeName }),
        signUp: false,
      }
    case 'soon': {
      const month = monthFormats[locale].format(atNoon(status.next.marketDate))
      return { text: format(season.soon, { month: locale === 'en' ? `in ${month}` : `i ${month}` }), signUp: true }
    }
    case 'off_season':
      return { text: season.offSeason, signUp: true }
  }
}
