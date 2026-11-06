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
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

// Place names of market days created by e2e tests start with this, so they can be cleaned up.
export const E2E_PLACE_PREFIX = 'E2E '

// Removes market days left behind by earlier e2e runs, so they never crowd the public front page.
export async function deleteTestMarketDays(): Promise<void> {
  const { error } = await adminClient().from('market_days').delete().like('place_name', `${E2E_PLACE_PREFIX}%`)
  if (error) throw error
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
