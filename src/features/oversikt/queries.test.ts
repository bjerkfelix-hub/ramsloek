import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
const mock = vi.hoisted(() => ({ role: 'picker', from: vi.fn(), ranges: [] as [string, number, number][], filters: [] as unknown[][], fail: '', count: 0 }))
vi.mock('@/lib/auth', () => ({ requireRole: async () => ({ role: mock.role }) }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ from: mock.from }) }))
import { getChain } from './queries'
import { chainPeriod } from './chain'
const period = chainPeriod('dag', new Date('2026-07-01T12:00:00Z'))
beforeEach(() => {
  vi.clearAllMocks()
  mock.role = 'picker'; mock.fail = ''; mock.count = 0; mock.ranges = []; mock.filters = []
  mock.from.mockImplementation((table: string) => {
    const q = {
      select: () => q, order: () => q,
      eq: (...args: unknown[]) => { mock.filters.push([table, 'eq', ...args]); return q },
      is: (...args: unknown[]) => { mock.filters.push([table, 'is', ...args]); return q },
      gte: (...args: unknown[]) => { mock.filters.push([table, 'gte', ...args]); return q },
      lte: (...args: unknown[]) => { mock.filters.push([table, 'lte', ...args]); return q },
      lt: (...args: unknown[]) => { mock.filters.push([table, 'lt', ...args]); return q },
      range: async (from: number, to: number) => {
        mock.ranges.push([table, from, to])
        const rows = table === 'batches' ? Array.from({ length: mock.count }, () => ({ gross_weight_g: 1000, sorting_checks: { batch_id: 'x' } })) : []
        return { data: rows.slice(from, to + 1), error: mock.fail === table ? Error('offline') : null }
      },
    }
    return q
  })
})
it.each(['picker', 'seller'])('never requests ledger or takings for %s', async role => {
  mock.role = role
  expect(await getChain(period)).toHaveLength(4)
  expect(mock.from).not.toHaveBeenCalledWith('ledger_entries')
  expect(mock.from).not.toHaveBeenCalledWith('market_takings')
})
it('pages both harvest queries beyond 1000 and leaves stock unbounded by period', async () => {
  mock.count = 1001
  const steps = await getChain(period)
  expect(steps[0].metrics[1].value).toBe(1001)
  expect(steps[1].metrics[0].value).toBe(1001)
  expect(mock.ranges.filter(r => r[0] === 'batches' && r[1] === 1000)).toHaveLength(2)
  expect(mock.filters.filter(f => f[0] === 'stock_movements')).toEqual([])
  expect(mock.filters).toContainEqual(['packings', 'lt', 'packed_at', period.end])
})
it('filters owner income exactly like ledger_totals and takings by market date', async () => {
  mock.role = 'owner'
  expect(await getChain(period)).toHaveLength(5)
  expect(mock.filters).toContainEqual(['ledger_entries', 'is', 'voided_at', null])
  expect(mock.filters).toContainEqual(['ledger_entries', 'eq', 'kind', 'income'])
  expect(mock.filters).toContainEqual(['market_takings', 'gte', 'market_days.market_date', period.from])
})
it('keeps other steps when a query fails', async () => {
  mock.fail = 'packings'
  expect((await getChain(period)).filter(s => s.failed).map(s => s.id)).toEqual(['packing'])
})
