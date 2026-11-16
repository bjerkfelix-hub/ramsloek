import { beforeEach, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
const mocks = vi.hoisted(() => ({ client: vi.fn(), exchange: vi.fn(), verify: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.client }))
import { GET } from './route'
beforeEach(() => {
  vi.clearAllMocks()
  mocks.client.mockResolvedValue({ auth: { exchangeCodeForSession: mocks.exchange, verifyOtp: mocks.verify } })
  mocks.exchange.mockResolvedValue({ error: null })
})
it.each(['magiclink', 'email', 'invite'])('redirects legacy %s tokens without verifying or creating a session', async type => {
  const params = new URLSearchParams({ token_hash: 'a+b&c', type })
  const response = await GET(new NextRequest(`http://localhost/auth/callback?${params}`))
  expect(response.status).toBe(303)
  expect(response.headers.get('location')).toBe(`/admin/login/lenke?${params}`)
  expect(mocks.client).not.toHaveBeenCalled()
  expect(mocks.verify).not.toHaveBeenCalled()
})
it('forwards even an empty hash or absent type to confirmation', async () => {
  const response = await GET(new NextRequest('http://localhost/auth/callback?token_hash='))
  expect(response.headers.get('location')).toBe('/admin/login/lenke?token_hash=')
  expect(mocks.client).not.toHaveBeenCalled()
})
it('keeps PKCE exchange and relative redirect', async () => {
  const response = await GET(new NextRequest('http://localhost/auth/callback?code=pkce'))
  expect(mocks.exchange).toHaveBeenCalledWith('pkce')
  expect(response.headers.get('location')).toBe('/admin')
})
it('keeps failed PKCE and missing-code redirects', async () => {
  mocks.exchange.mockResolvedValue({ error: new Error('invalid code') })
  for (const query of ['?code=invalid', '']) {
    expect((await GET(new NextRequest(`http://localhost/auth/callback${query}`))).headers.get('location')).toBe('/admin/login?error=callback')
  }
})
