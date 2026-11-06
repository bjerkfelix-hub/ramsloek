import { expect, test, type Page } from '@playwright/test'
import { loginAs } from './helpers'

const yy = new Date().toLocaleDateString('en-GB', { timeZone: 'Europe/Oslo', year: '2-digit' })

async function fillBatch(page: Page, weight: string) {
  await page.goto('/admin/batches/new')
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
  await page.goto('/admin/batches')
  const before = await page.locator('[data-testid="batch-row"]').count()
  await fillBatch(page, '1,2')
  await page.getByRole('button', { name: 'Lagre' }).dblclick()
  await page.waitForURL(/\/batches\/[0-9a-f-]{36}$/)
  await page.goto('/admin/batches')
  await expect(page.locator('[data-testid="batch-row"]')).toHaveCount(before + 1)
})

test('invalid weight shows an error and creates nothing', async ({ page }) => {
  await loginAs(page, 'picker')
  await page.goto('/admin/batches')
  const before = await page.locator('[data-testid="batch-row"]').count()
  await fillBatch(page, 'abc')
  await page.getByRole('button', { name: 'Lagre' }).click()
  await expect(page.locator('form').getByRole('alert')).toHaveText('Skriv vekt i kg, f.eks. 2,5')
  await page.goto('/admin/batches')
  await expect(page.locator('[data-testid="batch-row"]')).toHaveCount(before)
})

test('sorting check gates the pack section', async ({ page }) => {
  await loginAs(page, 'picker')
  await registerBatch(page)
  await expect(page.getByText('Ikke sorteringskontrollert').first()).toBeVisible()
  await expect(page.getByTestId('pack-section')).toHaveAttribute('aria-disabled', 'true')
  // The statement is shown above the sign button, which stays disabled until the confirmation is ticked.
  const statement = 'Sortert og kontrollert for liljekonvall og andre arter'
  const sign = page.getByRole('button', { name: 'Signer sorteringskontroll' })
  await expect(page.getByText(statement)).toBeVisible()
  await expect(sign).toBeDisabled()
  await page.getByLabel('Jeg bekrefter dette').check()
  await expect(sign).toBeEnabled()
  await sign.click()
  await expect(sign).toHaveCount(0)
  await expect(page.getByText(statement)).toBeVisible()
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
  await page.goto('/admin/batches')
  await expect(page.getByRole('heading', { name: 'Partier' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Ny høsting' })).toHaveCount(0)
  const res = await page.goto('/admin/batches/new')
  expect(res?.status()).toBe(404)
})

test('loose waste works before the sorting check is signed', async ({ page }) => {
  await loginAs(page, 'picker')
  await registerBatch(page)
  await expect(page.getByText('Ikke sorteringskontrollert').first()).toBeVisible()
  const form = page.getByTestId('loose-waste-form')
  await form.getByLabel('Svinn (kg)').fill('0,5')
  await form.getByLabel('Årsak').selectOption({ label: 'Skadet' })
  await form.getByRole('button', { name: 'Registrer svinn' }).click()
  await expect(page.getByTestId('remaining')).toHaveText('2 kg')
  await expect(page.getByText('Ikke sorteringskontrollert').first()).toBeVisible()
})

test('offline save shows a message, keeps the id, and the retry creates exactly one batch', async ({ page, context }) => {
  await loginAs(page, 'picker')
  await page.goto('/admin/batches')
  const before = await page.locator('[data-testid="batch-row"]').count()
  await fillBatch(page, '1,7')
  await context.setOffline(true)
  await page.getByRole('button', { name: 'Lagre' }).click()
  await expect(page.locator('form').getByRole('alert')).toHaveText('Ingen forbindelse – trykk Lagre igjen.')
  await expect(page.getByText('Application error')).toHaveCount(0)
  await context.setOffline(false)
  await page.getByRole('button', { name: 'Lagre' }).click()
  await page.waitForURL(/\/batches\/[0-9a-f-]{36}$/)
  await page.goto('/admin/batches')
  await expect(page.locator('[data-testid="batch-row"]')).toHaveCount(before + 1)
})

test('owner can correct gross weight and notes, but not below what is used', async ({ page }) => {
  await loginAs(page, 'picker')
  await registerBatch(page, '2,5')
  const url = page.url()
  await expect(page.getByText('Rediger')).toHaveCount(0)
  await loginAs(page, 'owner')
  await page.goto(url)
  await page.getByText('Rediger', { exact: true }).click()
  const form = page.getByTestId('edit-batch-form')
  await form.getByLabel('Bruttovekt (kg)').fill('3')
  await form.getByLabel('Notater').fill('Rettet vekt')
  await form.getByRole('button', { name: 'Lagre' }).click()
  await expect(form.getByRole('status')).toHaveText('Lagret.')
  await page.reload()
  await expect(page.getByText('Brutto 3 kg')).toBeVisible()
  await expect(page.locator('header p', { hasText: 'Rettet vekt' })).toBeVisible()
  // 0,5 kg loose waste, then try to go below it
  const waste = page.getByTestId('loose-waste-form')
  await waste.getByLabel('Svinn (kg)').fill('0,5')
  await waste.getByRole('button', { name: 'Registrer svinn' }).click()
  await expect(page.getByTestId('remaining')).toHaveText('2,5 kg')
  await page.getByText('Rediger', { exact: true }).click()
  await form.getByLabel('Bruttovekt (kg)').fill('0,3')
  await form.getByRole('button', { name: 'Lagre' }).click()
  await expect(form.getByRole('alert')).toHaveText('Vekten kan ikke være mindre enn det som allerede er pakket eller kastet.')
})

test('harvest time input cannot be in the future', async ({ page }) => {
  await loginAs(page, 'picker')
  await page.goto('/admin/batches/new')
  const input = page.getByLabel('Høstet (Oslo-tid)')
  await expect(input).toHaveAttribute('max', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
})
