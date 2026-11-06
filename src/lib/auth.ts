import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type Role = 'owner' | 'picker' | 'seller'
export type CurrentUser = { id: string; fullName: string; role: Role }

// Reads the session (validated against Supabase Auth) and the caller's active profile.
// Returns null when signed out or when the profile is inactive (app_role() is null).
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return null

  const { data: role } = await supabase.rpc('app_role')
  if (!role) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', userData.user.id)
    .single()
  if (!profile) return null

  return { id: userData.user.id, fullName: profile.full_name, role: role as Role }
}

export async function requireRole(...roles: Role[]): Promise<CurrentUser> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  if (roles.length > 0 && !roles.includes(user.role)) notFound()
  return user
}
