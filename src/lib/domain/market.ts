const dateFmt = new Intl.DateTimeFormat('nb-NO', {
  timeZone: 'UTC',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

/** "2027-05-09" -> "søndag 9. mai 2027". */
export function formatMarketDate(date: string): string {
  return dateFmt.format(new Date(`${date}T12:00:00Z`))
}

/** "10:00:00", "15:00" -> "10:00–15:00". */
export function formatMarketTimes(starts: string, ends: string): string {
  return `${starts.slice(0, 5)}–${ends.slice(0, 5)}`
}

export type MarketInput = { date: string; starts: string; ends: string; place: string; address: string }

export const MARKET_MISSING = 'Fyll inn dato, tid, sted og adresse.'
export const MARKET_TIME_ORDER = 'Sluttid må være etter starttid.'

/** Returns a Norwegian error message, or null when the market day is valid. */
export function validateMarketDay(v: MarketInput): string | null {
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(v.date) && !Number.isNaN(new Date(`${v.date}T12:00:00Z`).getTime())
  const time = /^\d{2}:\d{2}(:\d{2})?$/
  if (!validDate || !time.test(v.starts) || !time.test(v.ends) || !v.place || !v.address) return MARKET_MISSING
  if (v.ends.slice(0, 5) <= v.starts.slice(0, 5)) return MARKET_TIME_ORDER
  return null
}
