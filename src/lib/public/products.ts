import { createClient } from '@supabase/supabase-js'
import { supabaseEnv } from '@/lib/supabase/env'
import { timeoutFetch } from './market-days'
export type PublicProduct = { name: string; net_weight_g: number; unit_kind: 'consumer' }
export async function getPublicProducts(): Promise<PublicProduct[] | null> {
  try {
    const { url, anonKey } = supabaseEnv()
    const db = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: timeoutFetch() } })
    const { data, error } = await db.rpc('public_consumer_products')
    if (error) throw error
    return data ?? []
  } catch { return null }
}
