import { describe, expect, it } from 'vitest'
import {
  SHIFT_LABEL, TASK_STATUS_LABEL, isForgotten, isTaskOverdue, nextWeekMonday,
  parseHourlyRate, parseMonth, segmentPayOre, shiftInterval, splitAtOsloMidnight,
  strictOsloLocalToIso, summarizePlanning, weekPeriod, type PlanningSegment,
} from './planning'

describe('planning labels and rates', () => {
  it('uses Norwegian labels', () => {
    expect(SHIFT_LABEL).toEqual({ harvest: 'Høsting', packing: 'Pakking', market: 'Marked', other: 'Annet' })
    expect(TASK_STATUS_LABEL).toEqual({ todo: 'Å gjøre', in_progress: 'Pågår', done: 'Ferdig' })
  })
  it.each([
    ['250,50', 25050], ['250.5', 25050], ['0', 0], ['0,00', 0], ['10 000', 1000000],
    ['', null], ['   ', null], ['-1', null], ['12,345', null], ['1.234,50', null],
    ['10000,01', null], ['Infinity', null], ['1e3', null], ['99999999999999999999', null],
  ])('parses rate %j as %j', (input, expected) => {
    expect(parseHourlyRate(input as string)).toBe(expected)
  })
})

describe('calendar periods', () => {
  it('uses Monday–Sunday across the year boundary', () => {
    expect(weekPeriod('2027-01-01')).toEqual({ from: '2026-12-28', to: '2027-01-03' })
    expect(weekPeriod('2027-03-22')).toEqual({ from: '2027-03-22', to: '2027-03-28' })
    expect(nextWeekMonday('2027-03-22')).toBe('2027-03-29')
  })
  it.each(['', '2027-02-30', '2027-1-01', '0000-01-01'])('rejects invalid calendar date %j', (date) => {
    expect(() => weekPeriod(date)).toThrow(RangeError)
    expect(() => nextWeekMonday(date)).toThrow(RangeError)
  })
  it('rejects a non-Monday', () => {
    expect(() => nextWeekMonday('2027-03-23')).toThrow(RangeError)
  })
  it('parses a leap month', () => {
    expect(parseMonth('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' })
  })
  it.each(['2027-13', '2027-2', null, '', '0000-01'])('rejects invalid month %j', (value) => {
    expect(parseMonth(value)).toBeNull()
  })
})

describe('strict Oslo wall minutes and shifts', () => {
  it.each(['2027-02-30T10:00', '2027-03-28T24:00', '2027-03-28T02:30',
    '2027-10-31T02:30', '2027-03-28T08:00:01', '', '2027-13-01T10:00'])('rejects %j', (local) => {
    expect(strictOsloLocalToIso(local)).toBeNull()
  })
  it('converts a unique summer and winter minute', () => {
    expect(strictOsloLocalToIso('2027-03-28T08:00')).toBe('2027-03-28T06:00:00.000Z')
    expect(strictOsloLocalToIso('2027-01-01T08:00')).toBe('2027-01-01T07:00:00.000Z')
  })
  it('requires explicit next-day intent for an overnight shift', () => {
    expect(shiftInterval('2026-03-31', '23:30', '00:30', true)).toEqual({
      startsAt: '2026-03-31T21:30:00.000Z', endsAt: '2026-03-31T22:30:00.000Z',
    })
    expect(shiftInterval('2026-03-31', '23:30', '00:30', false)).toBeNull()
  })
  it('enforces positive duration and the 26-hour limit, including DST', () => {
    expect(shiftInterval('2027-10-31', '00:00', '00:00', true)).toEqual({
      startsAt: '2027-10-30T22:00:00.000Z', endsAt: '2027-10-31T23:00:00.000Z',
    })
    expect(shiftInterval('2027-10-31', '00:00', '02:00', true)).toBeNull()
    expect(shiftInterval('2027-03-22', '08:00', '08:00', false)).toBeNull()
    expect(shiftInterval('2027-03-28', '02:30', '08:00', false)).toBeNull()
    expect(shiftInterval('2027-02-30', '08:00', '09:00', false)).toBeNull()
  })
})

describe('daily elapsed time and exact pay', () => {
  it('splits across a month before filtering and pays each segment', () => {
    const rows = splitAtOsloMidnight('2026-03-31T21:30:00Z', '2026-03-31T22:30:00Z')
    expect(rows).toEqual([{ date: '2026-03-31', durationMs: 1800000 }, { date: '2026-04-01', durationMs: 1800000 }])
    expect(rows.map(row => segmentPayOre(row.durationMs, 25000))).toEqual([12500, 12500])
    expect(rows.filter(row => row.date <= '2026-03-31')).toEqual([{ date: '2026-03-31', durationMs: 1800000 }])
  })
  it.each([
    ['2026-03-29T00:30:00Z', '2026-03-29T01:30:00Z', '2026-03-29'],
    ['2026-10-25T00:30:00Z', '2026-10-25T01:30:00Z', '2026-10-25'],
  ])('uses elapsed time across DST from %s', (start, end, date) => {
    expect(splitAtOsloMidnight(start, end)).toEqual([{ date, durationMs: 3600000 }])
  })
  it.each([
    ['2026-03-28T23:00:00Z', '2026-03-29T22:00:00Z', '2026-03-29', 23],
    ['2026-10-24T22:00:00Z', '2026-10-25T23:00:00Z', '2026-10-25', 25],
  ])('uses real midnight boundaries on %s', (start, end, date, hours) => {
    expect(splitAtOsloMidnight(start, end)).toEqual([{ date, durationMs: hours * 3600000 }])
  })
  it('preserves zero entries and avoids empty trailing days', () => {
    expect(splitAtOsloMidnight('2026-03-31T22:00:00.123Z', '2026-03-31T22:00:00.123Z'))
      .toEqual([{ date: '2026-04-01', durationMs: 0 }])
    expect(splitAtOsloMidnight('2026-03-31T21:30:00Z', '2026-03-31T22:00:00Z'))
      .toEqual([{ date: '2026-03-31', durationMs: 1800000 }])
  })
  it('rounds half up per segment, including milliseconds', () => {
    expect(segmentPayOre(60000, 10000)).toBe(167)
    expect(segmentPayOre(60000, 10000)! * 2).toBe(334)
    expect(segmentPayOre(18, 100000)).toBe(1)
    expect(segmentPayOre(17, 100000)).toBe(0)
    expect(segmentPayOre(0, 25000)).toBe(0)
    expect(segmentPayOre(3600000, 0)).toBe(0)
    expect(segmentPayOre(0, null)).toBeNull()
    expect(segmentPayOre(3600000, null)).toBeNull()
    expect(segmentPayOre(Number.MAX_SAFE_INTEGER, 1000000)).toBe(2501999792983609)
  })
  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid duration %s', (duration) => {
    expect(() => segmentPayOre(duration, 100)).toThrow(RangeError)
  })
  it.each([-1, 0.5, NaN, Infinity, 1000001])('rejects invalid rate %s', (rate) => {
    expect(() => segmentPayOre(100, rate)).toThrow(RangeError)
  })
  it.each([['bad', '2026-01-01T00:00:00Z'], ['2026-01-02T00:00:00Z', '2026-01-01T00:00:00Z'],
    ['2026-01-01', '2026-01-02']])('rejects invalid interval %s–%s', (start, end) => {
    expect(() => splitAtOsloMidnight(start, end)).toThrow(RangeError)
  })
})

describe('planning totals', () => {
  const row = (sourceKind: 'shift' | 'time', durationMs: number, rateOre: number | null): PlanningSegment => ({
    profileId: 'person', date: '2026-03-31', sourceKind, sourceId: 'entry', durationMs, rateOre,
    amountOre: segmentPayOre(durationMs, rateOre),
  })
  it('sums pre-rounded amounts and counts unknown rates separately', () => {
    expect(summarizePlanning([row('shift', 7200000, 30000), row('time', 60000, 10000),
      row('time', 60000, 10000), row('time', 3600000, null)])).toEqual({
      plannedMs: 7200000, workedMs: 3720000, plannedAmountOre: 60000,
      workedAmountOre: 334, missingPlannedRateCount: 0, missingWorkedRateCount: 1,
    })
    expect(summarizePlanning([row('shift', 0, null), row('time', 3600000, 0)]))
      .toMatchObject({ missingPlannedRateCount: 1, missingWorkedRateCount: 0, workedAmountOre: 0 })
    expect(summarizePlanning([])).toEqual({ plannedMs: 0, workedMs: 0, plannedAmountOre: 0,
      workedAmountOre: 0, missingPlannedRateCount: 0, missingWorkedRateCount: 0 })
  })
  it('rejects unsafe totals and malformed numeric rows', () => {
    expect(() => summarizePlanning([row('time', Number.MAX_SAFE_INTEGER, 0), row('time', 1, 0)]))
      .toThrow(RangeError)
    expect(() => summarizePlanning([{ ...row('time', 100, 0), amountOre: 0.5 }])).toThrow(RangeError)
    expect(() => summarizePlanning([{ ...row('time', 100, null), amountOre: 0 }])).toThrow(RangeError)
  })
})

describe('dynamic warnings', () => {
  const start = '2026-03-31T10:00:00Z'
  const threshold = Date.parse(start) + 14 * 3600000
  it('flags only open entries strictly older than 14 hours', () => {
    expect(isForgotten(start, null, threshold)).toBe(false)
    expect(isForgotten(start, null, threshold + 1)).toBe(true)
    expect(isForgotten(start, '2026-03-31T11:00:00Z', threshold + 1)).toBe(false)
  })
  it('flags yesterday but not today, done, archived or undated tasks', () => {
    expect(isTaskOverdue('2026-03-30', 'todo', false, '2026-03-31')).toBe(true)
    expect(isTaskOverdue('2026-03-30', 'in_progress', false, '2026-03-31')).toBe(true)
    expect(isTaskOverdue('2026-03-31', 'todo', false, '2026-03-31')).toBe(false)
    expect(isTaskOverdue('2026-03-30', 'done', false, '2026-03-31')).toBe(false)
    expect(isTaskOverdue('2026-03-30', 'todo', true, '2026-03-31')).toBe(false)
    expect(isTaskOverdue(null, 'todo', false, '2026-03-31')).toBe(false)
  })
})
