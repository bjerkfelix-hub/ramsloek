import { expect, test, type Page } from '@playwright/test'
import { loginAs } from './helpers'

const yy = new Date().toLocaleDateString('en-GB', { timeZone: 'Europe/Oslo', year: '2-digit' })

async function fillBatch(page: Page, weight: string) {
  await page.goto('/batches/new')
  await page.getByLabel('Område').selectOption({ label: 'Bekken' })
  await page.getByLabel('Plukkere').fill('Kari og Ola')
  await page.getByLabel('Bruttovekt (kg)').fill(weight)
}

async function registerBatch(page: Page, weight = '2,5') {
  await fillBatch(page, weight)
  await page.getByRole('button', { name: 'Lagre' }).click()
  await page.waitForURL(/\/batches\/[0-9a-f-]{36}$/)
}

test('picker registers a batch and sees lot number and weight', async ({ page }) => {
  await loginAs(page, 'picker')
  await registerBatch(page, '2,5')
  await expect(page.getByText(new RegExp(`RL-${yy}-\\d+`)).first()).toBeVisible()
  await expect(page.getByText('2,5 kg').first()).toBeVisible()
  await expect(page.getByText('Bekken').first()).toBeVisible()
})

test('double-tapping Lagre creates exactly one batch', async ({ page }) => {
  await loginAs(page, 'picker')
  await page.goto('/batches')
  const before = await page.locator('[data-testid="batch-row"]').count()
  await fillBatch(page, '1,2')
  await page.getByRole('button', { name: 'Lagre' }).dblclick()
  await page.waitForURL(/\/batches\/[0-9a-f-]{36}$/)
  await page.goto('/batches')
  await expect(page.locator('[data-testid="batch-row"]')).toHaveCount(before + 1)
})

test('invalid weight shows an error and creates nothing', async ({ page }) => {
  await loginAs(page, 'picker')
  await page.goto('/batches')
  const before = await page.locator('[data-testid="batch-row"]').count()
  await fillBatch(page, 'abc')
  await page.getByRole('button', { name: 'Lagre' }).click()
  await expect(page.locator('form').getByRole('alert')).toHaveText('Skriv vekt i kg, f.eks. 2,5')
  await page.goto('/batches')
  await expect(page.locator('[data-testid="batch-row"]')).toHaveCount(before)
})

test('sorting check gates the pack section', async ({ page }) => {
  await loginAs(page, 'picker')
  await registerBatch(page)
  await expect(page.getByText('Ikke sorteringskontrollert').first()).toBeVisible()
  await expect(page.getByTestId('pack-section')).toHaveAttribute('aria-disabled', 'true')
  await page.getByRole('button', { name: 'Signer sorteringskontroll' }).click()
  await expect(page.getByText('Sortert og kontrollert for liljekonvall og andre arter')).toBeVisible()
  await expect(page.getByText('Per Plukker').first()).toBeVisible()
  await expect(page.getByTestId('pack-section')).toHaveAttribute('aria-disabled', 'false')
  await expect(page.getByText('Ikke sorteringskontrollert')).toHaveCount(0)
})

test('temperature log accepts a decimal comma', async ({ page }) => {
  await loginAs(page, 'picker')
  await registerBatch(page)
  await page.getByLabel('Temperatur (°C)').fill('3,5')
  await page.getByRole('button', { name: 'Logg temperatur' }).click()
  await expect(page.getByTestId('temperature-list')).toContainText('3,5 °C')
})

test('seller can read the list but not register', async ({ page }) => {
  await loginAs(page, 'seller')
  await page.goto('/batches')
  await expect(page.getByRole('heading', { name: 'Partier' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Ny høsting' })).toHaveCount(0)
  const res = await page.goto('/batches/new')
  expect(res?.status()).toBe(404)
})
