import { beforeEach, expect, it, vi } from 'vitest'
import { startClock, stopClock } from './actions'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
vi.mock('@/lib/auth', () => ({ requireRole: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const id = '11111111-1111-4111-8111-111111111111', rpc = vi.fn()
beforeEach(() => { vi.clearAllMocks(); vi.mocked(requireRole).mockReset(); vi.mocked(createClient).mockResolvedValue({ rpc } as never); rpc.mockResolvedValue({ data: { id }, error: null }) })
it.each(['owner','picker','seller'] as const)('allows active %s to clock only via narrow session RPCs', async role => {
  vi.mocked(requireRole).mockResolvedValue({ id, role, fullName: role })
  expect(await startClock(id)).toMatchObject({ ok: true, entry: { id } })
  expect(rpc).toHaveBeenCalledWith('clock_in', { p_start_key: id })
  expect(await stopClock(id)).toMatchObject({ ok: true, entry: { id } })
  expect(rpc).toHaveBeenCalledWith('clock_out', { p_entry_id: id })
  expect(requireRole).toHaveBeenCalledWith('owner','picker','seller')
  expect(createAdminClient).not.toHaveBeenCalled()
})
it('rejects malformed UUIDs before RPC', async () => { expect((await startClock('bad')).ok).toBe(false); expect((await stopClock('bad')).ok).toBe(false); expect(rpc).not.toHaveBeenCalled() })
it('reports conflicts without optimistic success', async () => { rpc.mockResolvedValue({ error: { message: 'TIME_ALREADY_OPEN' } }); expect(await startClock(id)).toEqual({ ok: false, error: 'Du er allerede stemplet inn.' }) })
it('fails closed for inactive or signed-out sessions', async () => { vi.mocked(requireRole).mockRejectedValue(Error('login')); await expect(startClock(id)).rejects.toThrow('login'); await expect(stopClock(id)).rejects.toThrow('login'); expect(rpc).not.toHaveBeenCalled() })
