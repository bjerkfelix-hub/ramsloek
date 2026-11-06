import { createAdminClient } from '@/lib/supabase/admin'

export type ActiveSignup = { email: string; language: string; consented_at: string }

/** Active (not unsubscribed) sign-ups, oldest first. Server-only: uses the service-role client. */
export async function listActiveSignups(): Promise<ActiveSignup[]> {
  const { data, error } = await createAdminClient()
    .from('season_signups')
    .select('email, language, consented_at')
    .is('unsubscribed_at', null)
    .order('consented_at', { ascending: true })
  if (error) throw error
  return data ?? []
}
