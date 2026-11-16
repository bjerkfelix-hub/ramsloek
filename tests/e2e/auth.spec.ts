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

test('auth callback answers with relative Location headers and requires a click', async ({ request, page }) => {
  // Behind a proxy request.nextUrl.origin is not the public host, so the redirect must not contain one.
  const bad = await request.get('/auth/callback?token_hash=not-a-real-token&type=magiclink', { maxRedirects: 0 })
  expect(bad.status()).toBe(303)
  expect(bad.headers()['location']).toBe('/admin/login/lenke?token_hash=not-a-real-token&type=magiclink')

  const missing = await request.get('/auth/callback', { maxRedirects: 0 })
  expect(missing.headers()['location']).toBe('/admin/login?error=callback')

  const invite = await request.get('/auth/callback?token_hash=x&type=invite', { maxRedirects: 0 })
  expect(invite.headers()['location']).toBe('/admin/login/lenke?token_hash=x&type=invite')

  const token = await magicLinkToken('picker')
  const ok = await request.get(`/auth/callback?token_hash=${token}&type=magiclink`, { maxRedirects: 0 })
  expect(ok.status()).toBe(303)
  expect(ok.headers()['location']).toBe(`/admin/login/lenke?token_hash=${token}&type=magiclink`)
  expect(ok.headersArray().some((h) => h.name.toLowerCase() === 'set-cookie' && h.value.startsWith('sb-'))).toBe(false)
  await page.goto(ok.headers()['location'])
  await expect(page.getByRole('button', { name: 'Logg inn', exact: true })).toBeVisible()
  // Opening the legacy link did not create a session or consume the token.
  await page.goto('/admin')
  await expect(page).toHaveURL(/\/admin\/login$/)
  await page.goto(ok.headers()['location'])
  await page.getByRole('button', { name: 'Logg inn', exact: true }).click()
  await expect(page).toHaveURL(/\/admin$/)
})

test('login does not reveal whether an e-mail has an account', async ({ page }) => {
  await page.goto('/admin/login')
  await page.getByLabel(/e-post/i).fill(`ingen-konto-${Date.now()}@example.com`)
  await page.getByRole('button', { name: /send/i }).click()
  await expect(page.getByRole('form', { name: 'Innloggingskode' })).toBeVisible()
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0)
})

test('login page explains a failed callback and points to the code', async ({ page }) => {
  await page.goto('/admin/login?error=callback')
  await expect(page.getByRole('main').getByRole('alert')).toHaveText(
    'Innloggingslenken er ugyldig eller utløpt. Be om en ny, eller bruk koden fra e-posten.',
  )
})

test('home page shows role-specific shortcuts', async ({ page }) => {
  const shortcuts = page.getByTestId('shortcut')
  await loginAs(page, 'picker')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Oversikt')
  await expect(shortcuts).toHaveText(['Ny høsting', 'Partier', 'Lager'])
  await loginAs(page, 'seller')
  await expect(shortcuts).toHaveText(['Partier', 'Lager', 'Regnskap'])
  await loginAs(page, 'owner')
  await expect(shortcuts).toHaveText(['Ny høsting', 'Partier', 'Lager', 'Produkter', 'Marked', 'Regnskap', 'Påmeldinger', 'Brukere', 'Innstillinger'])
})
