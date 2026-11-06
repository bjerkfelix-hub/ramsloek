import { loadEnvConfig } from '@next/env'
import { createClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'
import { loginAs } from './helpers'

function adminClient() {
  loadEnvConfig(process.cwd())
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

const stamp = Date.now()

test('owner saves company settings', async ({ page }) => {
  await loginAs(page, 'owner')
  await page.goto('/settings')
  await page.getByLabel('Firmanavn').fill('Nesodden Ramsløk AS')
  await page.getByLabel('Org.nr').fill('999888777')
  await page.getByRole('button', { name: 'Lagre' }).click()
  await expect(page.getByRole('status')).toHaveText('Lagret.')
  await page.reload()
  await expect(page.getByLabel('Firmanavn')).toHaveValue('Nesodden Ramsløk AS')
  await expect(page.getByLabel('Org.nr')).toHaveValue('999888777')
})

test('lot prefix must be A–Z and 0–9, at most 5 characters', async ({ page }) => {
  await loginAs(page, 'owner')
  await page.goto('/settings')
  await page.getByLabel('Partiprefiks').fill('ab-1')
  await page.getByRole('button', { name: 'Lagre' }).click()
  await expect(page.locator('form').getByRole('alert')).toHaveText('Partiprefiks kan bare ha A–Z og 0–9, maks 5 tegn.')
  await page.getByLabel('Partiprefiks').fill('RL')
  await page.getByRole('button', { name: 'Lagre' }).click()
  await expect(page.locator('form').getByRole('status')).toHaveText('Lagret.')
})

test('owner creates a harvest area', async ({ page }) => {
  const name = `Lia ${stamp}`
  await loginAs(page, 'owner')
  await page.goto('/areas')
  await page.getByLabel('Navn').first().fill(name)
  await page.getByRole('button', { name: 'Lagre' }).first().click()
  await expect(page.getByRole('row', { name: new RegExp(name) })).toBeVisible()
})

test('owner creates products with GTIN validation and duplicate detection', async ({ page }) => {
  const admin = adminClient()
  await admin.from('products').delete().eq('gtin', '07038010055713')
  const name = `Ramsløk 250 g pose ${stamp}`
  await loginAs(page, 'owner')
  await page.goto('/products')

  const form = page.locator('form:has(input[name="gtin"])')
  await form.getByLabel('Navn').fill(name)
  await form.getByLabel('Nettovekt (g)').fill('250')
  await form.getByLabel('Type').selectOption('consumer')
  await form.getByLabel('Holdbarhet (dager)').fill('6')
  await form.getByLabel('GTIN').fill('7038010055714')
  await form.getByRole('button', { name: 'Lagre' }).click()
  await expect(form.getByRole('alert')).toHaveText('Ugyldig GTIN (feil kontrollsiffer).')

  await form.getByLabel('GTIN').fill('7038010055713')
  await form.getByRole('button', { name: 'Lagre' }).click()
  const row = page.getByRole('row', { name: new RegExp(name) })
  await expect(row).toBeVisible()
  await expect(row).toContainText('07038010055713')

  await form.getByLabel('Nettovekt (g)').fill('100')
  await form.getByLabel('Navn').fill(`Duplikat ${stamp}`)
  await form.getByLabel('GTIN').fill('7038010055690')
  await form.getByRole('button', { name: 'Lagre' }).click()
  await expect(form.getByRole('alert')).toHaveText('Dette finnes allerede.')
  await admin.from('products').delete().eq('gtin', '07038010055713')
})

test('owner adds a picker', async ({ page }) => {
  const admin = adminClient()
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 })
  for (const u of data.users.filter((u) => u.email === 'ny@test.local')) await admin.auth.admin.deleteUser(u.id)

  await loginAs(page, 'owner')
  await page.goto('/users')
  await page.getByLabel('E-post').fill('ny@test.local')
  await page.getByLabel('Navn').fill('Ny Plukker')
  await page.getByLabel('Rolle').selectOption('picker')
  await page.getByRole('button', { name: 'Legg til bruker' }).click()
  await expect(page.getByRole('status')).toHaveText(
    'Brukeren er lagt til. Be dem logge inn på innloggingssiden med e-postadressen sin.',
  )
  const row = page.getByRole('row', { name: /ny@test\.local/ })
  await expect(row).toBeVisible()
  await expect(row).toContainText('Plukker')
  await expect(row).toContainText('Ikke logget inn ennå')
})

test('deactivating the seller locks them out', async ({ page, browser }) => {
  const admin = adminClient()
  try {
    const sellerPage = await (await browser.newContext()).newPage()
    await loginAs(sellerPage, 'seller')
    await loginAs(page, 'owner')
    await page.goto('/users')
    const row = page.getByRole('row', { name: /selger@test\.local/ })
    await row.getByRole('button', { name: 'Deaktiver' }).click()
    await expect(row).toContainText('Deaktivert')
    await sellerPage.goto('/')
    await expect(sellerPage).toHaveURL(/\/login$/)
    // The owner cannot deactivate themselves.
    await expect(page.getByRole('row', { name: /eier@test\.local/ }).getByRole('button')).toHaveCount(0)
  } finally {
    await admin.from('profiles').update({ active: true }).eq('id', 'a0000000-0000-0000-0000-000000000003')
  }
})
