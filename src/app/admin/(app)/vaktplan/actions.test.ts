import { beforeEach, expect, it, vi } from 'vitest'
import { saveShift, cancelShift, copyWeek } from './actions'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
vi.mock('@/lib/auth', () => ({ requireRole: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const id = '11111111-1111-4111-8111-111111111111'
const lookup = vi.fn(), insert = vi.fn(), update = vi.fn(), rpc = vi.fn()
const from = vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle: lookup }) }), insert, update }))
function form(over: Record<string,string | undefined> = {}) { const f = new FormData(); for (const [k,v] of Object.entries({ id, profile_id: id, date: '2027-03-22', start: '08:00', end: '12:00', kind: 'harvest', note: '', ...over })) f.set(k,v ?? ''); return f }
beforeEach(() => { vi.clearAllMocks(); vi.mocked(createClient).mockResolvedValue({ from, rpc } as never); lookup.mockResolvedValue({ data: null, error: null }); insert.mockResolvedValue({ error: null }); rpc.mockResolvedValue({ data: 2, error: null }) })
it('creates a shift with business fields only', async () => { expect(await saveShift(form())).toEqual({ ok: true, id }); expect(insert).toHaveBeenCalledWith({ id, profile_id: id, starts_at: '2027-03-22T07:00:00.000Z', ends_at: '2027-03-22T11:00:00.000Z', kind: 'harvest', note: null }) })
it.each([{ id: 'bad' }, { kind: 'bad' }, { date: '2027-02-30' }, { date: '2027-03-28', start: '02:30' }])('rejects invalid payload %j', async over => { expect((await saveShift(form(over))).ok).toBe(false); expect(from).not.toHaveBeenCalled() })
it('same create id is idempotent only for identical business fields', async () => {
  lookup.mockResolvedValue({ data: { profile_id: id, starts_at: '2027-03-22T07:00:00+00:00', ends_at: '2027-03-22T11:00:00+00:00', kind: 'harvest', note: null }, error: null })
  expect((await saveShift(form())).ok).toBe(true)
  expect((await saveShift(form({ note: 'different' }))).ok).toBe(false)
  expect(update).not.toHaveBeenCalled()
})
it('cancels by RPC without timestamps', async () => { expect((await cancelShift(id, 'Feil vakt')).ok).toBe(true); expect(rpc).toHaveBeenCalledWith('cancel_work_shift', { p_id: id, p_reason: 'Feil vakt' }); expect((await cancelShift(id, ' ')).ok).toBe(false) })
it('copies atomically using only the week RPC', async () => { expect(await copyWeek('2027-03-22')).toEqual({ ok: true, copied: 2 }); expect(rpc).toHaveBeenCalledWith('copy_work_week', { p_monday: '2027-03-22' }); expect(from).not.toHaveBeenCalled() })
it('explains failed copy and rejects non-Mondays', async () => { rpc.mockResolvedValue({ error: { message: 'SHIFT_OVERLAP' } }); expect(await copyWeek('2027-03-22')).toMatchObject({ ok: false, error: expect.stringContaining('Ingen vakter ble kopiert.') }); expect((await copyWeek('2027-03-23')).ok).toBe(false) })
it.each(['picker', 'seller'])('denies %s every mutation', async () => { vi.mocked(requireRole).mockRejectedValue(Error('404')); for (const run of [() => saveShift(form()), () => cancelShift(id,'grunn'), () => copyWeek('2027-03-22')]) await expect(run()).rejects.toThrow('404'); expect(from).not.toHaveBeenCalled(); expect(rpc).not.toHaveBeenCalled(); expect(requireRole).toHaveBeenCalledWith('owner'); vi.mocked(requireRole).mockReset() })
it('propagates insert failures', async () => { insert.mockResolvedValue({ error: { message: 'SHIFT_OVERLAP' } }); expect((await saveShift(form())).ok).toBe(false) })
it('edits only after an explicit edit intent and reports update failure', async () => {
  lookup.mockResolvedValue({ data: { id, cancelled_at: null }, error: null })
  const result = vi.fn().mockResolvedValue({ data: [{ id }], error: null })
  update.mockReturnValue({ eq: () => ({ select: result }) })
  expect(await saveShift(form({ intent: 'edit', note: 'Changed' }))).toEqual({ ok: true, id })
  expect(update).toHaveBeenCalledWith(expect.objectContaining({ note: 'Changed' }))
  result.mockResolvedValue({ data: null, error: { message: 'SHIFT_OVERLAP' } })
  expect((await saveShift(form({ intent: 'edit' }))).ok).toBe(false)
})
it('rejects an ambiguous end with the local-time explanation', async () => {
  expect(await saveShift(form({ date: '2027-10-31', start: '00:30', end: '02:30' }))).toMatchObject({ ok: false, error: expect.stringContaining('tvetydig') })
})
it('does not edit missing or cancelled shifts', async () => {
  expect((await saveShift(form({ intent: 'edit' }))).ok).toBe(false)
  lookup.mockResolvedValue({ data: { cancelled_at: '2027-01-01' }, error: null })
  expect((await saveShift(form({ intent: 'edit' }))).ok).toBe(false)
  expect(update).not.toHaveBeenCalled()
})
