import { describe, expect, it } from 'vitest'
import { aggregateChain, chainPeriod, formatChainNumber, type ChainData } from './chain'

const period = chainPeriod('dag', new Date('2026-07-01T12:00:00Z'))
const empty: ChainData = { batches: [], sorted: [], packings: [], movements: [], waste: [], income: [], takings: [] }
describe('Oslo periods', () => {
  it('defaults invalid and repeated params to season, starting on Oslo 1 January', () => {
    for (const input of [undefined, 'bad', ['dag', 'uke']]) {
      expect(chainPeriod(input, new Date('2025-12-31T23:30:00Z'))).toEqual({ key: 'sesong', from: '2026-01-01', to: '2026-01-01', start: '2025-12-31T23:00:00.000Z', end: '2026-01-01T23:00:00.000Z' })
    }
  })
  it('includes today and the six preceding calendar days across year boundaries', () => {
    expect(chainPeriod('uke', new Date('2026-01-01T12:00:00Z'))).toMatchObject({ from: '2025-12-26', to: '2026-01-01' })
  })
  it('uses Oslo today rather than the UTC date in summer', () => {
    expect(chainPeriod('dag', new Date('2026-06-30T22:15:00Z'))).toMatchObject({ from: '2026-07-01', to: '2026-07-01', start: '2026-06-30T22:00:00.000Z', end: '2026-07-01T22:00:00.000Z' })
  })
  it.each([
    ['2026-03-29T12:00:00Z', 23],
    ['2026-10-25T12:00:00Z', 25],
  ])('honours DST day length at %s', (now, hours) => {
    const p = chainPeriod('dag', new Date(now))
    expect((Date.parse(p.end) - Date.parse(p.start)) / 3600000).toBe(hours)
  })
})
describe('chain aggregation', () => {
  it('shows zero for empty data and averages with zero market days', () => {
    const steps = aggregateChain('owner', period, empty)
    expect(steps).toHaveLength(5)
    expect(steps.flatMap(s => s.metrics).every(m => Object.is(m.value, 0))).toBe(true)
    expect(steps.some(s => s.failed)).toBe(false)
  })
  it('sums grams before kg rounding, checks, packing, outflow and both forms of waste', () => {
    const steps = aggregateChain('owner', period, { ...empty,
      batches: [{ gross_weight_g: 1249 }, { gross_weight_g: 1249 }], sorted: [true, false],
      packings: [{ units: 10, weight_g: 1249 }, { units: 20, weight_g: 1249 }],
      movements: [
        { units: 30, kind: 'pack', created_at: '2026-06-01T12:00:00Z' },
        { units: -3, kind: 'sell', created_at: '2026-06-30T22:00:00+00:00' },
        { units: -2, kind: 'deliver', created_at: '2026-07-01T10:00:00Z' },
        { units: -1, kind: 'sell', created_at: period.end },
        { units: -4, kind: 'waste', created_at: period.start },
        { units: 2, kind: 'adjust', created_at: period.start },
      ], waste: [{ units: 4, weight_g: null }, { units: null, weight_g: 550 }],
    })
    expect(steps[0].metrics.map(m => m.value)).toEqual([2.498, 2])
    expect(formatChainNumber(steps[0].metrics[0].value, 1)).toBe('2,5')
    expect(steps[1].metrics.map(m => m.value)).toEqual([1, 1])
    expect(steps[2].metrics.map(m => m.value)).toEqual([30, 2.498])
    expect(steps[3].metrics.map(m => m.value)).toEqual([5, 22, 4, 0.55])
  })
  it('matches active ledger income, counts distinct active takings days, handles no days', () => {
    const income = [{ kind: 'income', amount_ore: 345000, voided_at: null }, { kind: 'income', amount_ore: 100000, voided_at: 'void' }, { kind: 'expense', amount_ore: 1200, voided_at: null }]
    const takings = [{ market_day_id: 'a', voided_at: null }, { market_day_id: 'a', voided_at: null }, { market_day_id: 'b', voided_at: null }, { market_day_id: 'c', voided_at: 'void' }]
    expect(aggregateChain('owner', period, { ...empty, income, takings })[4].metrics.map(m => m.value)).toEqual([3450, 1725])
    expect(aggregateChain('owner', period, { ...empty, income })[4].metrics[1].value).toBe(0)
    expect(formatChainNumber(3450)).toBe('3 450')
  })
  it.each(['picker', 'seller'] as const)('does not compute or include value for %s', role => {
    const data = { ...empty, get income(): never { throw Error('must not read') }, get takings(): never { throw Error('must not read') } }
    expect(aggregateChain(role, period, data).map(s => s.id)).toEqual(['picking', 'sorting', 'packing', 'delivery'])
  })
  it('isolates failures rather than showing false zeroes', () => {
    const steps = aggregateChain('owner', period, { ...empty, packings: null })
    expect(steps.filter(s => s.failed).map(s => s.id)).toEqual(['packing'])
  })
})
