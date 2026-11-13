import { cookieOptions } from './cookie-options'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { supabaseEnv } from './env'

// Per-request client bound to the caller's session cookies (RLS applies).
export async function createClient() {
  // Reading cookies first marks the route dynamic, so env is only checked at request time.
  const cookieStore = await cookies()
  const { url, anonKey } = supabaseEnv()
  return createServerClient(url, anonKey, {
    cookieOptions,
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // Called from a Server Component; the proxy refreshes the session instead.
        }
      },
    },
  })
}
