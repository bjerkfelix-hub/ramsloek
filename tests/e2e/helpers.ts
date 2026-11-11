import { loadEnvConfig } from '@next/env'
import { createClient } from '@supabase/supabase-js'
import type { Page } from '@playwright/test'

export type Role = 'owner' | 'picker' | 'seller'

const EMAIL: Record<Role, string> = {
  owner: 'eier@test.local',
  picker: 'plukker@test.local',
  seller: 'selger@test.local',
}

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]'])

// Bound setup/cleanup requests too: these execute outside Playwright's browser timeouts.
export const localFetch: typeof fetch = (input, init) => fetch(input, {
  ...init,
  signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000),
})

// Service-role client for test setup (bypasses RLS). Refuses anything but a local Supabase, since
// the tests generate login links and delete rows with it.
export function adminClient() {
  loadEnvConfig(process.cwd())
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see .env.example)')
  const host = new URL(url).hostname
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(`e2e tests only run against a local Supabase (127.0.0.1, localhost or [::1]); got host "${host}"`)
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: localFetch } })
}

// Planning fixtures retain Auth identities for their audit foreign keys. Seeded users can
// therefore move beyond Auth's first page; look them up without assuming a page size.
export async function authUserId(role: Role): Promise<string> {
  const admin = adminClient()
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    const user = data.users.find(user => user.email === EMAIL[role])
    if (user) return user.id
    if (data.users.length < 1000) throw Error(`Missing local seeded ${role}`)
  }
}

// Place names of market days created by e2e tests start with this, so they can be cleaned up.
export const E2E_PLACE_PREFIX = 'E2E '

// Retire test markets without deleting the days referenced by retained ledger history.
export async function deleteTestMarketDays(): Promise<void> {
  const admin = adminClient()
  const ids: string[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.from('market_days').select('id')
      .like('place_name', `${E2E_PLACE_PREFIX}%`).order('id').range(from, from + 999)
    if (error) throw error
    ids.push(...data.map(day => day.id))
    if (data.length < 1000) break
  }
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100)
    const { data, error } = await admin.from('market_takings').select('market_day_id').in('market_day_id', batch)
    if (error) throw error
    const retained = new Set(data.map(taking => taking.market_day_id))
    const unused = batch.filter(id => !retained.has(id))
    if (retained.size) {
      const { error } = await admin.from('market_days').update({ cancelled: true }).in('id', [...retained])
      if (error) throw error
    }
    if (unused.length) {
      const { error } = await admin.from('market_days').delete().in('id', unused)
      if (error) throw error
    }
  }
}

// YYYY-MM-DD `days` from now (UTC date; tests use offsets of several days, so the Oslo date agrees).
export function isoInDays(days: number): string {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10)
}

// Admin-generated magic link token (hashed) for the seeded local user of the given role.
export async function magicLinkToken(role: Role): Promise<string> {
  const admin = adminClient()
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email: EMAIL[role] })
  if (error) throw error
  return data.properties.hashed_token
}

// Signs in as the seeded local user of the given role via an admin-generated magic link (generateLink).
export async function loginAs(page: Page, role: Role): Promise<void> {
  const token = await magicLinkToken(role)
  // The action link would land on Supabase's verify endpoint with tokens in a URL fragment;
  // go straight to our callback with the hashed token instead (same session result).
  await page.goto(`/auth/callback?token_hash=${token}&type=magiclink`)
  await page.waitForURL((u) => u.pathname === '/admin')
}

// Ticks the confirmation and signs the sorting check on the batch page.
export async function signSortingCheck(page: Page): Promise<void> {
  await page.getByLabel('Jeg bekrefter dette').check()
  await page.getByRole('button', { name: 'Signer sorteringskontroll' }).click()
}
