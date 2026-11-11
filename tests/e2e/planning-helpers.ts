import { createClient } from '@supabase/supabase-js'
import type { Page } from '@playwright/test'
import { adminClient, magicLinkToken, type Role } from './helpers'

export async function planningUser(role: Role) {
  const admin = adminClient()
  const label = `E2E ${role} ${crypto.randomUUID()}`
  const email = `${crypto.randomUUID()}@planning.test.local`
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true, app_metadata: { role }, user_metadata: { full_name: label } })
  if (error || !data.user) throw error ?? Error('Missing user')
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
  const fixtureOwner = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
  checked(await fixtureOwner.auth.verifyOtp({ token_hash: await magicLinkToken('owner'), type: 'magiclink' }))
  checked(await fixtureOwner.from('profiles').update({ role }).eq('id', data.user.id))
  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  if (link.error) throw link.error
  const session = await client.auth.verifyOtp({ token_hash: link.data.properties.hashed_token, type: 'magiclink' })
  if (session.error) throw session.error
  return { id: data.user.id, label, email, client }
}
export async function loginPlanning(page: Page, email: string) {
  const link = await adminClient().auth.admin.generateLink({ type: 'magiclink', email })
  if (link.error) throw link.error
  await page.goto(`/auth/callback?token_hash=${link.data.properties.hashed_token}&type=magiclink`)
  await page.waitForURL(u => u.pathname === '/admin')
}
export function checked<T extends { error: unknown }>(result: T): T { if (result.error) throw result.error; return result }
