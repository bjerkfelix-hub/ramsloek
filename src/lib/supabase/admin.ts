import 'server-only'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// Service-role client: bypasses RLS. Server-side use only, never import from client code.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Supabase admin is not configured: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.')
  }
  return createSupabaseClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}
