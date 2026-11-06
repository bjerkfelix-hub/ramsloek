export type MarketDay = {
  id: string
  marketDate: string // YYYY-MM-DD (Oslo date)
  startsAt: string // HH:MM
  endsAt: string // HH:MM
  placeName: string
  address: string
  noteNo: string | null
  noteEn: string | null
  cancelled: boolean
}

export type SeasonStatus =
  | { kind: 'in_season'; next: MarketDay }
  | { kind: 'soon'; next: MarketDay }
  | { kind: 'off_season' }

/** A market day within this many days (inclusive) counts as "in season". */
export const SEASON_WINDOW_DAYS = 14

function dayNumber(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000)
}

/** `todayOslo` is the current Oslo date as YYYY-MM-DD. Cancelled and past days are ignored. */
export function seasonStatus(days: MarketDay[], todayOslo: string): SeasonStatus {
  const upcoming = days
    .filter((d) => !d.cancelled && d.marketDate >= todayOslo)
    .sort((a, b) => a.marketDate.localeCompare(b.marketDate) || a.startsAt.localeCompare(b.startsAt))
  const next = upcoming[0]
  if (!next) return { kind: 'off_season' }
  const distance = dayNumber(next.marketDate) - dayNumber(todayOslo)
  return distance <= SEASON_WINDOW_DAYS ? { kind: 'in_season', next } : { kind: 'soon', next }
}
