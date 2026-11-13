import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('Supabase cookie options', () => {
  it.each(['production', 'development', 'test'])('uses secure cookies only in production (%s)', async (environment) => {
    vi.stubEnv('NODE_ENV', environment)
    vi.resetModules()
    const { cookieOptions } = await import('./cookie-options')
    expect(cookieOptions).toEqual({
      secure: environment === 'production',
      sameSite: 'lax',
    })
  })
})
