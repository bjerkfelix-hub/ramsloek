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

// A second independently authenticated connection for concurrency tests.
export async function planningConnection(email: string) {
  const admin = adminClient()
  const link = checked(await admin.auth.admin.generateLink({ type: 'magiclink', email }))
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
  checked(await client.auth.verifyOtp({ token_hash: link.data.properties!.hashed_token, type: 'magiclink' }))
  return client
}
export async function closePlanningClock(person: Awaited<ReturnType<typeof planningUser>>) {
  const rows = checked(await person.client.from('time_entries').select('id').eq('profile_id', person.id).is('ended_at', null)).data ?? []
  for (const row of rows) checked(await person.client.rpc('clock_out', { p_entry_id: row.id }))
}

export async function planningClosedEntry(owner: Awaited<ReturnType<typeof planningUser>>, person: Awaited<ReturnType<typeof planningUser>>, start: string, end: string) {
  const entry = checked(await person.client.rpc('clock_in', { p_start_key: crypto.randomUUID() })).data!
  return checked(await owner.client.rpc('correct_time_entry', { p_id: entry.id, p_started_at: start, p_ended_at: end, p_reason: 'E2E hours fixture', p_expected_version: entry.version })).data!
}
