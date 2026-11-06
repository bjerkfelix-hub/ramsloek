import { expect, test } from '@playwright/test'
import { loginAs, magicLinkToken } from './helpers'

test('signed-out user is sent to login', async ({ page }) => {
  await page.goto('/admin')
  await expect(page).toHaveURL(/\/admin\/login$/)
  await expect(page.getByRole('heading', { name: 'Logg inn' })).toBeVisible()
})

test('picker sees picker nav only', async ({ page }) => {
  await loginAs(page, 'picker')
  const nav = page.getByRole('navigation')
  await expect(nav.getByRole('link', { name: 'Partier' })).toBeVisible()
  await expect(nav.getByRole('link', { name: 'Lager' })).toBeVisible()
  await expect(nav.getByRole('link', { name: 'Innstillinger' })).toHaveCount(0)
  await expect(nav.getByRole('link', { name: 'Brukere' })).toHaveCount(0)
})

test('owner sees owner nav', async ({ page }) => {
  await loginAs(page, 'owner')
  const nav = page.getByRole('navigation')
  for (const name of ['Partier', 'Lager', 'Produkter', 'Områder', 'Brukere', 'Innstillinger']) {
    await expect(nav.getByRole('link', { name })).toBeVisible()
  }
})

test('picker opening /settings gets 404', async ({ page }) => {
  await loginAs(page, 'picker')
  const res = await page.goto('/admin/settings')
  expect(res?.status()).toBe(404)
})

test('auth callback answers with relative Location headers', async ({ request }) => {
  // Behind a proxy request.nextUrl.origin is not the public host, so the redirect must not contain one.
  const bad = await request.get('/auth/callback?token_hash=not-a-real-token&type=magiclink', { maxRedirects: 0 })
  expect(bad.status()).toBe(303)
  expect(bad.headers()['location']).toBe('/admin/login?error=callback')

  const missing = await request.get('/auth/callback', { maxRedirects: 0 })
  expect(missing.headers()['location']).toBe('/admin/login?error=callback')

  const invite = await request.get('/auth/callback?token_hash=x&type=invite', { maxRedirects: 0 })
  expect(invite.headers()['location']).toBe('/admin/login?error=callback')

  const ok = await request.get(`/auth/callback?token_hash=${await magicLinkToken('picker')}&type=magiclink`, { maxRedirects: 0 })
  expect(ok.status()).toBe(303)
  expect(ok.headers()['location']).toBe('/admin')
  expect(ok.headersArray().some((h) => h.name.toLowerCase() === 'set-cookie' && h.value.startsWith('sb-'))).toBe(true)
})

test('login page explains a failed callback and the same-browser rule', async ({ page }) => {
  await page.goto('/admin/login?error=callback')
  await expect(page.getByRole('alert')).toHaveText(
    'Innloggingslenken er ugyldig eller utløpt. Be om en ny, og åpne den på samme enhet og i samme nettleser.',
  )
})

test('home page shows role-specific shortcuts', async ({ page }) => {
  const shortcuts = page.getByTestId('shortcut')
  await loginAs(page, 'picker')
  await expect(shortcuts).toHaveText(['Ny høsting', 'Partier', 'Lager'])
  await loginAs(page, 'seller')
  await expect(shortcuts).toHaveText(['Partier', 'Lager'])
  await loginAs(page, 'owner')
  await expect(shortcuts).toHaveText(['Ny høsting', 'Partier', 'Lager', 'Produkter', 'Brukere', 'Innstillinger'])
})
