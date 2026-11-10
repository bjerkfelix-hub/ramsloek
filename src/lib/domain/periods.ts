export type Period = { from: string; to: string }
export type PeriodPreset = 'this-month' | 'last-month' | 'this-year' | 'last-year'

/** Receives an Oslo calendar date, normally from todayOslo(). UTC is used only for date arithmetic. */
export function presetPeriod(preset: PeriodPreset, today: string): Period {
  const start = new Date(`${today}T00:00:00Z`)
  start.setUTCDate(1)
  switch (preset) {
    case 'last-month':
      start.setUTCMonth(start.getUTCMonth() - 1)
      break
    case 'this-year':
      start.setUTCMonth(0)
      break
    case 'last-year':
      start.setUTCFullYear(start.getUTCFullYear() - 1, 0)
      break
  }
  const end = new Date(start)
  const months = preset === 'this-year' || preset === 'last-year' ? 12 : 1
  end.setUTCMonth(end.getUTCMonth() + months)
  end.setUTCDate(0)
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) }
}

function isCalendarDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function parsePeriod(from: string | null, to: string | null): Period | null {
  if (!isCalendarDate(from) || !isCalendarDate(to) || from > to) return null
  const latest = new Date(`${from}T00:00:00Z`)
  latest.setUTCFullYear(latest.getUTCFullYear() + 3)
  // Clamp a leap-day anniversary to the final day of February.
  if (latest.getUTCMonth() !== Number(from.slice(5, 7)) - 1) latest.setUTCDate(0)
  if (new Date(`${to}T00:00:00Z`).getTime() > latest.getTime()) return null
  return { from, to }
}

export function monthKey(date: string): string {
  return date.slice(0, 7)
}
