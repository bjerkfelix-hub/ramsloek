import { afterEach, describe, expect, it, vi } from 'vitest'
import { getUpcomingMarketDays } from './market-days'

const row = {
  id: 'a1',
  market_date: '2027-05-08',
  starts_at: '10:00:00',
  ends_at: '15:00:00',
  place_name: 'Bondens marked Vinkelplassen',
  address: 'Vinkelplassen, 0365 Oslo',
  note_no: 'Ved fontenen',
  note_en: 'By the fountain',
  cancelled: true,
}

// Minimal stand-in for the Supabase query builder: every method chains, awaiting resolves to `result`.
function fakeClient(result: unknown) {
  const calls: [string, unknown[]][] = []
  const builder: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'gte', 'order', 'limit']) {
    builder[m] = (...args: unknown[]) => {
      calls.push([m, args])
      return builder
    }
  }
  builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject)
  const client = {
    from: (table: string) => {
      calls.push(['from', [table]])
      return builder
    },
  }
  return { client: client as never, calls }
}

describe('getUpcomingMarketDays', () => {
  afterEach(() => vi.restoreAllMocks())

  it('maps rows to market days (cancelled included) and asks for upcoming published rows in order', async () => {
    const { client, calls } = fakeClient({ data: [row], error: null })
    const result = await getUpcomingMarketDays(3, client)
    expect(result).toEqual({
      ok: true,
      days: [
        {
          id: 'a1',
          marketDate: '2027-05-08',
          startsAt: '10:00',
          endsAt: '15:00',
          placeName: 'Bondens marked Vinkelplassen',
          address: 'Vinkelplassen, 0365 Oslo',
          noteNo: 'Ved fontenen',
          noteEn: 'By the fountain',
          cancelled: true,
        },
      ],
    })
    const names = calls.map((c) => c[0])
    expect(names[0]).toBe('from')
    expect(calls[0][1]).toEqual(['market_days'])
    expect(calls).toContainEqual(['eq', ['published', true]])
    expect(calls.find((c) => c[0] === 'gte')?.[1][0]).toBe('market_date')
    expect(calls.filter((c) => c[0] === 'order').map((c) => c[1][0])).toEqual(['market_date', 'starts_at'])
    expect(calls).toContainEqual(['limit', [3]])
  })

  it('does not limit when no limit is given', async () => {
    const { client, calls } = fakeClient({ data: [], error: null })
    expect(await getUpcomingMarketDays(undefined, client)).toEqual({ ok: true, days: [] })
    expect(calls.some((c) => c[0] === 'limit')).toBe(false)
  })

  it('returns { ok: false } when the query returns an error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client } = fakeClient({ data: null, error: { message: 'boom', code: 'XX000' } })
    expect(await getUpcomingMarketDays(3, client)).toEqual({ ok: false })
  })

  it('returns { ok: false } when the client throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const client = {
      from() {
        throw new Error('network down')
      },
    }
    expect(await getUpcomingMarketDays(3, client as never)).toEqual({ ok: false })
  })

  it('returns { ok: false } when the awaited query rejects', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client } = fakeClient(Promise.reject(new Error('fetch failed')))
    expect(await getUpcomingMarketDays(3, client)).toEqual({ ok: false })
  })

  it('returns { ok: false } when Supabase is not configured', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '')
    try {
      expect(await getUpcomingMarketDays(3)).toEqual({ ok: false })
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
