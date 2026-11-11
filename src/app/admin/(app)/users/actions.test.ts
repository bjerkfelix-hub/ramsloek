import { beforeEach, expect, it, vi } from 'vitest'
import { setHourlyRate } from './actions'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
vi.mock('@/lib/auth', () => ({ requireRole: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => { throw Error('No admin rates') }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const upsert = vi.fn()
const from = vi.fn(() => ({ upsert }))
const id = '11111111-1111-4111-8111-111111111111'
function form(rate = '250', profile = id) { const f = new FormData(); f.set('profile_id', profile); f.set('rate', rate); return f }
beforeEach(() => { vi.clearAllMocks(); vi.mocked(createClient).mockResolvedValue({ from } as never); upsert.mockResolvedValue({ error: null }) })
it.each(['0', '250', '300'])('writes %s as private integer øre', async rate => {
  expect(await setHourlyRate(form(rate))).toEqual({ ok: true })
  expect(requireRole).toHaveBeenCalledWith('owner')
  expect(from).toHaveBeenCalledWith('work_rates')
  expect(upsert).toHaveBeenCalledWith({ profile_id: id, hourly_rate_ore: Number(rate) * 100 }, { onConflict: 'profile_id' })
  for (const path of ['/admin/users', '/admin/vaktplan', '/admin/timer']) expect(revalidatePath).toHaveBeenCalledWith(path)
})
it.each(['', '-1', '10000.01', '2.555'])('rejects invalid rate %s', async rate => { expect((await setHourlyRate(form(rate))).ok).toBe(false); expect(from).not.toHaveBeenCalled() })
it('rejects invalid person', async () => { expect((await setHourlyRate(form('250', 'bad'))).ok).toBe(false) })
it.each(['picker', 'seller'])('rejects %s before accessing data', async () => {
  vi.mocked(requireRole).mockRejectedValueOnce(Error('404'))
  await expect(setHourlyRate(form())).rejects.toThrow('404'); expect(from).not.toHaveBeenCalled()
})
it('does not report success on database failure', async () => { upsert.mockResolvedValueOnce({ error: { code: '42501' } }); expect((await setHourlyRate(form())).ok).toBe(false) })
