import { beforeEach, expect, it, vi } from 'vitest'
import { correctTime } from './actions'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
vi.mock('@/lib/auth', () => ({ requireRole: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const id = '11111111-1111-4111-8111-111111111111', rpc = vi.fn(), lookup = vi.fn()
const row = { started_at: '2026-10-25T00:30:42.123Z', ended_at: '2026-10-25T02:30:44.456Z', version: 3 }
function form(over: Record<string,string | undefined> = {}) { const f = new FormData(); Object.entries({ id, expected_version: '3', start: '2026-10-25T02:30', end: '2026-10-25T03:30', original_start: row.started_at, original_end: row.ended_at, reason: 'Glemte å stoppe', ...over }).forEach(([k,v]) => f.set(k,v ?? '')); return f }
beforeEach(() => { vi.clearAllMocks(); vi.mocked(requireRole).mockReset(); vi.mocked(createClient).mockResolvedValue({ rpc, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: lookup }) }) }) } as never); lookup.mockResolvedValue({ data: row, error: null }); rpc.mockResolvedValue({ data: {}, error: null }) })
it.each(['picker','seller'])('denies %s correction', async () => { vi.mocked(requireRole).mockRejectedValue(Error('404')); await expect(correctTime(form())).rejects.toThrow('404'); expect(requireRole).toHaveBeenCalledWith('owner'); expect(rpc).not.toHaveBeenCalled() })
it('preserves unchanged ambiguous instants and milliseconds from the database', async () => { expect((await correctTime(form())).ok).toBe(true); expect(rpc).toHaveBeenCalledWith('correct_time_entry', { p_id: id, p_started_at: row.started_at, p_ended_at: row.ended_at, p_reason: 'Glemte å stoppe', p_expected_version: 3, p_fill_missing_rate: false }); expect(createAdminClient).not.toHaveBeenCalled() })
it.each([{ reason: ' ' }, { id: 'bad' }, { expected_version: '0' }, { start: '2027-03-28T02:30' }, { start: '2026-10-25T02:31' }, { original_start: '2026-10-25T01:30:00Z' }])('rejects malformed, changed ambiguous or forged originals %j', async over => { expect((await correctTime(form(over))).ok).toBe(false); expect(rpc).not.toHaveBeenCalled() })
it('allows explicit zero and one-time fill intent; DB validates rate and ordering', async () => { expect((await correctTime(form({ end: '2026-10-25T02:30', original_end: row.started_at, fill_missing_rate: 'on' }))).ok).toBe(false); expect((await correctTime(form({ start: '2026-10-24T10:00', end: '2026-10-24T10:00', fill_missing_rate: 'on' }))).ok).toBe(true); expect(rpc.mock.calls.at(-1)?.[1]).toMatchObject({ p_started_at: '2026-10-24T08:00:00.000Z', p_ended_at: '2026-10-24T08:00:00.000Z', p_fill_missing_rate: true }) })
it('returns stale and lookup failures without writing', async () => { rpc.mockResolvedValue({ error: { message: 'PLANNING_STALE' } }); expect((await correctTime(form())).ok).toBe(false); lookup.mockResolvedValue({ data: null, error: null }); rpc.mockClear(); expect((await correctTime(form())).ok).toBe(false); expect(rpc).not.toHaveBeenCalled() })
it.each(['TIME_RATE', 'TIME_INTERVAL', 'TIME_OVERLAP'])('preserves database failure %s', async message => {
  rpc.mockResolvedValue({ error: { message } })
  expect(await correctTime(form())).toMatchObject({ ok: false, error: expect.any(String) })
})
it('preserves a unique unchanged minute with sub-minute precision too', async () => {
  const value = '2026-10-24T08:00:12.345Z'
  lookup.mockResolvedValue({ data: { ...row, started_at: value }, error: null })
  expect((await correctTime(form({ start: '2026-10-24T10:00', original_start: value }))).ok).toBe(true)
  expect(rpc.mock.calls[0][1].p_started_at).toBe(value)
})
it.each([{ end: '2027-02-30T10:00' }, { end: '2026-10-25T02:31' }, { reason: 'x'.repeat(501) }])('rejects invalid end/reason %j', async over => {
  expect((await correctTime(form(over))).ok).toBe(false)
  expect(rpc).not.toHaveBeenCalled()
})
