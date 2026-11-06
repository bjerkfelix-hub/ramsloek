import { loadEnvConfig } from '@next/env'
import { createClient } from '@supabase/supabase-js'
import type { Page } from '@playwright/test'

export type Role = 'owner' | 'picker' | 'seller'

const EMAIL: Record<Role, string> = {
  owner: 'eier@test.local',
  picker: 'plukker@test.local',
  seller: 'selger@test.local',
}

// Admin-generated magic link token (hashed) for the seeded local user of the given role.
export async function magicLinkToken(role: Role): Promise<string> {
  loadEnvConfig(process.cwd())
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see .env.example)')
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
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
  await page.waitForURL((u) => u.pathname === '/')
}

// Ticks the confirmation and signs the sorting check on the batch page.
export async function signSortingCheck(page: Page): Promise<void> {
  await page.getByLabel('Jeg bekrefter dette').check()
  await page.getByRole('button', { name: 'Signer sorteringskontroll' }).click()
}
