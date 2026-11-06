import { expect, test, type Page } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'
import { adminClient, loginAs, signSortingCheck } from './helpers'

const PRODUCT = 'Ramsløk 100 g pose'

async function setupPacking(page: Page) {
  await loginAs(page, 'picker')
  await page.goto('/admin/batches/new')
  await page.getByLabel('Område').selectOption({ label: 'Bekken' })
  await page.getByLabel('Plukkere').fill('Kari og Ola')
  await page.getByLabel('Bruttovekt (kg)').fill('2,5')
  await page.getByRole('button', { name: 'Lagre' }).click()
  await page.waitForURL(/\/batches\/[0-9a-f-]{36}$/)
  await signSortingCheck(page)
  await expect(page.getByTestId('pack-section')).toHaveAttribute('aria-disabled', 'false')
  const form = page.getByTestId('pack-form')
  await form.getByLabel('Produkt').selectOption({ label: PRODUCT })
  await form.getByLabel('Antall pakker').fill('10')
  await form.getByRole('button', { name: 'Pakk' }).click()
  const link = page.getByTestId('packing-row').first().getByRole('link', { name: 'Skriv ut etiketter' })
  await expect(link).toBeVisible()
  return (await link.getAttribute('href'))!
}

test('labels PDF: download, limits, unknown id and signed-out', async ({ page, browser }) => {
  const href = await setupPacking(page)

  const ok = await page.request.get(href)
  expect(ok.status()).toBe(200)
  expect(ok.headers()['content-type']).toBe('application/pdf')
  expect(ok.headers()['content-disposition']).toMatch(/^inline; filename="etiketter-.+\.pdf"$/)
  const body = await ok.body()
  expect(body.subarray(0, 5).toString()).toBe('%PDF-')
  // default copies = units (10 pages)
  expect((await PDFDocument.load(body)).getPageCount()).toBe(10)

  const three = await page.request.get(`${href}?copies=3`)
  expect(three.status()).toBe(200)
  expect((await PDFDocument.load(await three.body())).getPageCount()).toBe(3)

  const tooMany = await page.request.get(`${href}?copies=501`)
  expect(tooMany.status()).toBe(400)
  expect(await tooMany.text()).toBe('Maks 500 etiketter om gangen.')
  expect((await page.request.get(`${href}?copies=0`)).status()).toBe(400)
  expect((await page.request.get(`${href}?copies=abc`)).status()).toBe(400)

  expect((await page.request.get('/api/labels/00000000-0000-4000-8000-000000000000')).status()).toBe(404)
  expect((await page.request.get('/api/labels/not-a-uuid')).status()).toBe(404)

  const anon = await browser.newContext()
  const res = await anon.request.get(href, { maxRedirects: 0 })
  expect(res.status()).toBe(401)
  await anon.close()
})

test('seller can print labels too', async ({ page }) => {
  const href = await setupPacking(page)
  await page.context().clearCookies()
  await loginAs(page, 'seller')
  const res = await page.request.get(href)
  expect(res.status()).toBe(200)
})

test('batch page warns when company name or address is missing, but printing still works', async ({ page }) => {
  const admin = adminClient()
  const { data: before } = await admin.from('settings').select('company_name, address').single()
  const warning = 'Firmanavn og adresse mangler i Innstillinger – de skal stå på etiketten.'
  try {
    await admin.from('settings').update({ company_name: 'Test AS', address: 'Gata 1' }).eq('id', true)
    const href = await setupPacking(page)
    const batchUrl = page.url()
    await expect(page.getByTestId('label-info-warning')).toHaveCount(0)

    await admin.from('settings').update({ address: null }).eq('id', true)
    await page.goto(batchUrl)
    await expect(page.getByTestId('label-info-warning')).toContainText(warning)
    // Picker sees no settings link; printing is still allowed.
    await expect(page.getByTestId('label-info-warning').getByRole('link')).toHaveCount(0)
    expect((await page.request.get(href)).status()).toBe(200)

    await loginAs(page, 'owner')
    await page.goto(batchUrl)
    await expect(page.getByTestId('label-info-warning').getByRole('link', { name: 'Gå til Innstillinger' })).toHaveAttribute('href', '/admin/settings')
  } finally {
    await admin.from('settings').update({ company_name: before!.company_name, address: before!.address }).eq('id', true)
  }
})
