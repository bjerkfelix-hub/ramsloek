import { beforeEach, expect, it, vi } from 'vitest'
import { inviteUser, setHourlyRate, setUserActive } from './actions'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
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

const updateUserById = vi.fn()
const selectUpdated = vi.fn()
const updateProfile = vi.fn(() => ({ eq: vi.fn(() => ({ select: selectUpdated })) }))
it.each([false, true])('sets active=%s before changing Auth ban', async active => {
  vi.mocked(requireRole).mockResolvedValue({ id: 'owner', role: 'owner', fullName: 'Owner' })
  vi.mocked(createClient).mockResolvedValue({ from: () => ({ update: updateProfile }) } as never)
  selectUpdated.mockResolvedValue({ data: [{ id }], error: null })
  vi.mocked(createAdminClient).mockReturnValue({ auth: { admin: { updateUserById } } } as never)
  updateUserById.mockResolvedValue({ error: null })
  expect(await setUserActive(id, active)).toEqual({ ok: true })
  expect(updateProfile).toHaveBeenCalledWith({ active })
  expect(updateUserById).toHaveBeenCalledWith(id, { ban_duration: active ? 'none' : '876000h' })
  expect(selectUpdated.mock.invocationCallOrder[0]).toBeLessThan(updateUserById.mock.invocationCallOrder[0])
})
it.each([{ error: { code: '42501' } }, { data: [] }])('never bans after rejected or missing profile update', async result => {
  vi.mocked(requireRole).mockResolvedValue({ id: 'owner', role: 'owner', fullName: 'Owner' })
  vi.mocked(createClient).mockResolvedValue({ from: () => ({ update: updateProfile }) } as never)
  selectUpdated.mockResolvedValue(result)
  expect((await setUserActive(id, false)).ok).toBe(false)
  expect(createAdminClient).not.toHaveBeenCalled()
})
it('never changes the owner’s own account', async () => {
  vi.mocked(requireRole).mockResolvedValue({ id, role: 'owner', fullName: 'Owner' })
  expect((await setUserActive(id, false)).ok).toBe(false)
  expect(createClient).not.toHaveBeenCalled()
  expect(createAdminClient).not.toHaveBeenCalled()
})
it.each(['response', 'throw'])('reports Auth ban failure (%s) after saving the profile', async mode => {
  vi.mocked(requireRole).mockResolvedValue({ id: 'owner', role: 'owner', fullName: 'Owner' })
  vi.mocked(createClient).mockResolvedValue({ from: () => ({ update: updateProfile }) } as never)
  selectUpdated.mockResolvedValue({ data: [{ id }], error: null })
  vi.mocked(createAdminClient).mockReturnValue({ auth: { admin: { updateUserById } } } as never)
  if (mode === 'throw') updateUserById.mockRejectedValue(Error('network'))
  else updateUserById.mockResolvedValue({ error: { message: 'auth failed' } })
  expect(await setUserActive(id, false)).toEqual({ ok: false, error: expect.stringContaining('Profilen er lagret') })
})

const createUser = vi.fn()
it.each(['owner', 'picker', 'seller'])('provisions an active %s only after Auth creates the user', async role => {
  vi.mocked(requireRole).mockResolvedValue({ id: 'owner', role: 'owner', fullName: 'Owner' })
  vi.mocked(createAdminClient).mockReturnValue({ auth: { admin: { createUser } } } as never)
  createUser.mockResolvedValue({ data: { user: { id } }, error: null })
  vi.mocked(createClient).mockResolvedValue({ from: () => ({ update: updateProfile }) } as never)
  selectUpdated.mockResolvedValue({ data: [{ id }], error: null })
  const form = new FormData()
  for (const [key, value] of Object.entries({ email: 'new@example.test', full_name: 'New', role })) form.set(key, value)
  expect(await inviteUser(form)).toEqual({ ok: true })
  expect(createUser).toHaveBeenCalledWith(expect.objectContaining({ app_metadata: { role } }))
  expect(updateProfile).toHaveBeenCalledWith({ role, active: true })
  expect(createUser.mock.invocationCallOrder[0]).toBeLessThan(updateProfile.mock.invocationCallOrder[0])
})
it.each(['auth', 'profile'])('reports provisioning failure at %s', async stage => {
  vi.mocked(requireRole).mockResolvedValue({ id: 'owner', role: 'owner', fullName: 'Owner' })
  vi.mocked(createAdminClient).mockReturnValue({ auth: { admin: { createUser } } } as never)
  createUser.mockResolvedValue(stage === 'auth' ? { data: { user: null }, error: { code: 'failed' } } : { data: { user: { id } }, error: null })
  vi.mocked(createClient).mockResolvedValue({ from: () => ({ update: updateProfile }) } as never)
  selectUpdated.mockResolvedValue({ data: null, error: { code: '42501' } })
  const form = new FormData()
  for (const [key, value] of Object.entries({ email: 'new@example.test', full_name: 'New', role: 'seller' })) form.set(key, value)
  expect((await inviteUser(form)).ok).toBe(false)
  if (stage === 'auth') expect(updateProfile).not.toHaveBeenCalled()
})
