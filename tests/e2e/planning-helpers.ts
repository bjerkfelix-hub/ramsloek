import { createClient } from '@supabase/supabase-js'
import { test as base, expect, type Page, type Locator } from '@playwright/test'
import { adminClient, magicLinkToken, localFetch, type Role } from './helpers'

type PlanningUser = { id: string; label: string; email: string; client: ReturnType<typeof adminClient> }
const users: PlanningUser[] = []

// Retain records/history, but retire each test's fixtures before another owner's global
// schedule/copy/report reads them. Never delete planning rows or disable their guards.
export const test = base.extend<{ planningFixtures: void }>({
  planningFixtures: [async ({}, runTest) => {
    try { await runTest() } finally {
      const people = users.splice(0)
      if (people.length) {
        const owner = await planningConnection('eier@test.local')
        for (const person of people) await closePlanningClock(person)
        const shifts = checked(await owner.from('work_shifts').select('id').in('profile_id', people.map(p => p.id)).is('cancelled_at', null)).data ?? []
        for (const shift of shifts) checked(await owner.rpc('cancel_work_shift', { p_id: shift.id, p_reason: 'E2E fixture retired' }))
        const tasks = checked(await owner.from('work_tasks').select('id').in('created_by', people.map(p => p.id)).is('archived_at', null)).data ?? []
        for (const task of tasks) checked(await owner.rpc('archive_work_task', { p_id: task.id }))
        checked(await owner.from('profiles').update({ active: false }).in('id', people.map(p => p.id)))
      }
    }
  }, { auto: true, timeout: 15000 }],
})

// A click dispatches the action; it does not wait for mutation + revalidated RSC.
// Wait for the complete response before starting short UI assertions (cold dev
// compilation and owner pages can take longer than the default assertion timeout).
export async function submitPlanning(button: Locator) {
  const responsePromise = button.page().waitForResponse(response => {
    const request = response.request()
    return request.method() === 'POST' && !!request.headers()['next-action']
  })
  const [response] = await Promise.all([responsePromise, button.click()])
  expect(response.status()).toBe(200)
  expect(await response.finished()).toBeNull()
  return response.request()
}

export async function planningUser(role: Role): Promise<PlanningUser> {
  const admin = adminClient()
  const label = `E2E ${role} ${crypto.randomUUID()}`
  const email = `${crypto.randomUUID()}@planning.test.local`
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true, app_metadata: { role }, user_metadata: { full_name: label } })
  if (error || !data.user) throw error ?? Error('Missing user')
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: localFetch } })
  const fixtureOwner = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: localFetch } })
  checked(await fixtureOwner.auth.verifyOtp({ token_hash: await magicLinkToken('owner'), type: 'magiclink' }))
  checked(await fixtureOwner.from('profiles').update({ role }).eq('id', data.user.id))
  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  if (link.error) throw link.error
  const session = await client.auth.verifyOtp({ token_hash: link.data.properties.hashed_token, type: 'magiclink' })
  if (session.error) throw session.error
  const person = { id: data.user.id, label, email, client }
  users.push(person)
  return person
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
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: localFetch } })
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
