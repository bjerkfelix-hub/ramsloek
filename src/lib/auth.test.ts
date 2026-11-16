import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn(), from: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc, from: mocks.from }) }))
vi.mock('react', () => ({ cache: (fn: unknown) => fn }))
import { getCurrentUser } from './auth'
beforeEach(() => vi.clearAllMocks())
it('treats an inactive session as signed out before reading hidden profiles', async () => {
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'inactive' } } })
  mocks.rpc.mockResolvedValue({ data: null })
  expect(await getCurrentUser()).toBeNull()
  expect(mocks.from).not.toHaveBeenCalled()
})
it('treats a revoked Auth session as signed out', async () => {
  mocks.getUser.mockResolvedValue({ data: { user: null } })
  expect(await getCurrentUser()).toBeNull()
  expect(mocks.rpc).not.toHaveBeenCalled()
})
