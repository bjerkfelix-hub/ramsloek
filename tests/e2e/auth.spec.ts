import { expect, test } from '@playwright/test'
import { loginAs } from './helpers'

test('signed-out user is sent to login', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login$/)
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
  const res = await page.goto('/settings')
  expect(res?.status()).toBe(404)
})
