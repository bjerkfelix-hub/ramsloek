import { createClient } from '@/lib/supabase/server'

export type ActiveSignup = { email: string; language: string; consented_at: string }

/**
 * Active (not unsubscribed) sign-ups, oldest first. Uses the caller's session (RLS applies):
 * only an owner can read season_signups, so any other caller gets an empty list.
 * Callers still check the role themselves before calling.
 */
export async function listActiveSignups(): Promise<ActiveSignup[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('season_signups')
    .select('email, language, consented_at')
    .is('unsubscribed_at', null)
    .order('consented_at', { ascending: true })
  if (error) throw error
  return data ?? []
}
