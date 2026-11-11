import { parseKr } from './money'
import { parsePeriod, presetPeriod, type Period } from './periods'
import { osloLocalToIso, todayOslo } from './time'

export type ShiftKind = 'harvest' | 'packing' | 'market' | 'other'
export const SHIFT_LABEL: Record<ShiftKind, string> = {
  harvest: 'Høsting', packing: 'Pakking', market: 'Marked', other: 'Annet',
}
export type TaskStatus = 'todo' | 'in_progress' | 'done'
export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'Å gjøre', in_progress: 'Pågår', done: 'Ferdig',
}

const HOUR_MS = 3600000
const DAY_MS = 24 * HOUR_MS
const wallFormatter = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Oslo', hourCycle: 'h23', year: 'numeric', month: '2-digit',
  day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
})

export function parseHourlyRate(input: string): number | null {
  if (!input.trim()) return null
  const normalized = input.trim().replace(/[ \u00a0\u202f]/g, '')
  if (/^0+([.,]0{1,2})?$/.test(normalized)) return 0
  const ore = parseKr(input)
  return ore !== null && ore <= 1000000 ? ore : null
}

function validDate(value: string): boolean {
  return parsePeriod(value, value) !== null
}

function addDays(date: string, days: number): string {
  const result = new Date(`${date}T00:00:00Z`)
  result.setUTCDate(result.getUTCDate() + days)
  const value = result.toISOString().slice(0, 10)
  if (!validDate(value)) throw new RangeError('Calendar date out of range')
  return value
}

export function parseMonth(value: string | null): Period | null {
  if (!value || !/^\d{4}-\d{2}$/.test(value) || !validDate(`${value}-01`)) return null
  return presetPeriod('this-month', `${value}-01`)
}

export function weekPeriod(today: string): Period {
  if (!validDate(today)) throw new RangeError('Invalid calendar date')
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay()
  const from = addDays(today, -((weekday + 6) % 7))
  return { from, to: addDays(from, 6) }
}

export function nextWeekMonday(monday: string): string {
  if (!validDate(monday) || new Date(`${monday}T00:00:00Z`).getUTCDay() !== 1) {
    throw new RangeError('Expected a Monday')
  }
  return addDays(monday, 7)
}

function wallAt(ms: number): string {
  const parts = wallFormatter.formatToParts(new Date(ms))
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)!.value
  return `${part('year').padStart(4, '0')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}:${part('second')}`
}

/** Reject normalized dates, DST gaps and repeated wall minutes. */
export function strictOsloLocalToIso(local: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(local) || !validDate(local.slice(0, 10))) return null
  const wall = Date.parse(`${local}:00Z`)
  const seed = osloLocalToIso(local)
  if (!seed) return null
  // Sample both sides of any Oslo offset transition. Construct all candidate
  // instants from the offsets, then require exactly one wall-clock round trip.
  const candidates = new Set<number>()
  for (const delta of [-DAY_MS, 0, DAY_MS]) {
    const sample = Date.parse(seed) + delta
    const offset = Date.parse(`${wallAt(sample)}Z`) - sample
    const candidate = wall - offset
    if (wallAt(candidate) === `${local}:00`) candidates.add(candidate)
  }
  return candidates.size === 1 ? new Date([...candidates][0]).toISOString() : null
}

export function shiftInterval(date: string, start: string, end: string, nextDay: boolean): { startsAt: string; endsAt: string } | null {
  if (!validDate(date)) return null
  let endDate: string
  try { endDate = nextDay ? addDays(date, 1) : date } catch { return null }
  const startsAt = strictOsloLocalToIso(`${date}T${start}`)
  const endsAt = strictOsloLocalToIso(`${endDate}T${end}`)
  if (!startsAt || !endsAt) return null
  const duration = Date.parse(endsAt) - Date.parse(startsAt)
  return duration > 0 && duration <= 26 * HOUR_MS ? { startsAt, endsAt } : null
}

export type DaySegment = { date: string; durationMs: number }

function instantMs(value: string): number {
  // Require an explicit offset; never depend on the host/browser time zone.
  if (!/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)
    || !validDate(value.slice(0, 10))) throw new RangeError('Invalid instant')
  const ms = Date.parse(value)
  if (!Number.isSafeInteger(ms)) throw new RangeError('Invalid instant')
  return ms
}

export function splitAtOsloMidnight(start: string, end: string): DaySegment[] {
  let cursor = instantMs(start)
  const finish = instantMs(end)
  if (finish < cursor) throw new RangeError('Inverted interval')
  const rows: DaySegment[] = []
  do {
    const date = todayOslo(new Date(cursor))
    // Midnight is a calendar boundary, independent of user wall-minute validation.
    const midnight = osloLocalToIso(`${addDays(date, 1)}T00:00`)
    if (!midnight || Date.parse(midnight) <= cursor) throw new RangeError('Invalid midnight boundary')
    const boundary = Math.min(finish, Date.parse(midnight))
    rows.push({ date, durationMs: boundary - cursor })
    cursor = boundary
  } while (cursor < finish)
  return rows
}

function nonnegativeInteger(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError('Expected a nonnegative safe integer')
}

function validRate(rate: number | null): void {
  if (rate === null) return
  nonnegativeInteger(rate)
  if (rate > 1000000) throw new RangeError('Hourly rate out of range')
}

function safeNumber(value: bigint): number {
  const number = Number(value)
  nonnegativeInteger(number)
  return number
}

export function segmentPayOre(durationMs: number, rateOre: number | null): number | null {
  nonnegativeInteger(durationMs)
  validRate(rateOre)
  if (rateOre === null) return null
  return safeNumber((BigInt(durationMs) * BigInt(rateOre) + BigInt(HOUR_MS / 2)) / BigInt(HOUR_MS))
}

export function isForgotten(start: string, end: string | null, nowMs: number): boolean {
  if (!Number.isSafeInteger(nowMs)) throw new RangeError('Invalid current instant')
  const started = instantMs(start)
  return end === null && started < nowMs - 14 * HOUR_MS
}

export function isTaskOverdue(dueDate: string | null, status: TaskStatus, archived: boolean, today: string): boolean {
  if (!validDate(today) || (dueDate !== null && !validDate(dueDate))) throw new RangeError('Invalid calendar date')
  return !archived && status !== 'done' && dueDate !== null && dueDate < today
}

export type PlanningSegment = {
  profileId: string; date: string; sourceKind: 'shift' | 'time'; sourceId: string
  durationMs: number; rateOre: number | null; amountOre: number | null
}

export function summarizePlanning(rows: PlanningSegment[]): {
  plannedMs: number; workedMs: number; plannedAmountOre: number; workedAmountOre: number
  missingPlannedRateCount: number; missingWorkedRateCount: number
} {
  const totals = { plannedMs: 0, workedMs: 0, plannedAmountOre: 0, workedAmountOre: 0,
    missingPlannedRateCount: 0, missingWorkedRateCount: 0 }
  for (const row of rows) {
    nonnegativeInteger(row.durationMs)
    validRate(row.rateOre)
    if ((row.rateOre === null) !== (row.amountOre === null)) throw new RangeError('Inconsistent missing rate')
    if (row.amountOre !== null) nonnegativeInteger(row.amountOre)
    if (row.sourceKind !== 'shift' && row.sourceKind !== 'time') throw new RangeError('Invalid segment source')
    const planned = row.sourceKind === 'shift'
    const durationKey = planned ? 'plannedMs' : 'workedMs'
    const amountKey = planned ? 'plannedAmountOre' : 'workedAmountOre'
    totals[durationKey] = safeNumber(BigInt(totals[durationKey]) + BigInt(row.durationMs))
    totals[amountKey] = safeNumber(BigInt(totals[amountKey]) + BigInt(row.amountOre ?? 0))
    if (row.rateOre === null) totals[planned ? 'missingPlannedRateCount' : 'missingWorkedRateCount']++
  }
  return totals
}
