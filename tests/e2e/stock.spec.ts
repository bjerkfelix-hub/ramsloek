import { loadEnvConfig } from '@next/env'
import { createClient } from '@supabase/supabase-js'
import { expect, test, type Page } from '@playwright/test'
import { loginAs, signSortingCheck } from './helpers'

function adminClient() {
  loadEnvConfig(process.cwd())
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

const osloDate = new Intl.DateTimeFormat('nb-NO', { timeZone: 'Europe/Oslo', dateStyle: 'medium' })
const PRODUCT = 'Ramsløk 100 g pose'

// Creates a fresh 2,5 kg batch and signs the sorting check through the UI; returns batch url and lot number.
async function setupBatch(page: Page) {
  await loginAs(page, 'picker')
  await page.goto('/admin/batches/new')
  await page.getByLabel('Område').selectOption({ label: 'Bekken' })
  await page.getByLabel('Plukkere').fill('Kari og Ola')
  await page.getByLabel('Bruttovekt (kg)').fill('2,5')
  await page.getByRole('button', { name: 'Lagre' }).click()
  await page.waitForURL(/\/batches\/[0-9a-f-]{36}$/)
  await signSortingCheck(page)
  await expect(page.getByTestId('pack-section')).toHaveAttribute('aria-disabled', 'false')
  const lot = (await page.getByRole('heading', { level: 1 }).textContent())!.trim()
  return { url: page.url(), lot }
}

async function pack(page: Page, units: string) {
  const form = page.getByTestId('pack-form')
  await form.getByLabel('Produkt').selectOption({ label: PRODUCT })
  await form.getByLabel('Antall pakker').fill(units)
  await form.getByRole('button', { name: 'Pakk' }).click()
}

test.describe.serial('packing, stock and waste', () => {
  let url = ''
  let lot = ''

  test('packing 10 bags reduces the remaining weight and shows a labelled packing row', async ({ page }) => {
    ;({ url, lot } = await setupBatch(page))
    await expect(page.getByTestId('remaining')).toHaveText('2,5 kg')
    await pack(page, '10')
    await expect(page.getByTestId('remaining')).toHaveText('1,5 kg')
    const row = page.getByTestId('packing-row').first()
    const bb = new Date()
    bb.setDate(bb.getDate() + 6)
    await expect(row).toContainText(PRODUCT)
    await expect(row).toContainText('10 stk')
    await expect(row).toContainText(osloDate.format(bb))
    await expect(row.getByRole('link', { name: 'Skriv ut etiketter' })).toHaveAttribute('href', /^\/api\/labels\/[0-9a-f-]{36}$/)
  })

  test('packing more than is left is rejected', async ({ page }) => {
    await loginAs(page, 'picker')
    await page.goto(url)
    await pack(page, '20')
    await expect(page.getByTestId('pack-form').getByRole('alert')).toHaveText('Det er ikke nok igjen av partiet.')
    await expect(page.getByTestId('remaining')).toHaveText('1,5 kg')
    await expect(page.getByTestId('packing-row')).toHaveCount(1)
  })

  test('stock page lists the product, lot and units', async ({ page }) => {
    await loginAs(page, 'picker')
    await page.goto('/admin/stock')
    await expect(page.getByRole('heading', { name: PRODUCT })).toBeVisible()
    const row = page.getByTestId('stock-row').filter({ hasText: lot })
    await expect(row).toContainText('10 stk')
  })

  test('waste of units from the stock page lowers the stock', async ({ page }) => {
    await loginAs(page, 'picker')
    await page.goto('/admin/stock')
    const row = page.getByTestId('stock-row').filter({ hasText: lot })
    await row.getByLabel('Antall svinn').fill('2')
    await row.getByLabel('Årsak').selectOption({ label: 'Visnet' })
    await row.getByRole('button', { name: 'Registrer svinn' }).click()
    await expect(page.getByTestId('stock-row').filter({ hasText: lot })).toContainText('8 stk')
  })

  test('wasting more than is in stock is rejected', async ({ page }) => {
    await loginAs(page, 'picker')
    await page.goto('/admin/stock')
    const row = page.getByTestId('stock-row').filter({ hasText: lot })
    await row.getByLabel('Antall svinn').fill('50')
    await row.getByRole('button', { name: 'Registrer svinn' }).click()
    await expect(row.getByRole('alert')).toHaveText('Det er ikke nok på lager.')
    await expect(row).toContainText('8 stk')
  })

  test('loose waste in kilos lowers the remaining weight', async ({ page }) => {
    await loginAs(page, 'picker')
    await page.goto(url)
    const form = page.getByTestId('loose-waste-form')
    await form.getByLabel('Svinn (kg)').fill('0,5')
    await form.getByLabel('Årsak').selectOption({ label: 'Skadet' })
    await form.getByRole('button', { name: 'Registrer svinn' }).click()
    await expect(page.getByTestId('remaining')).toHaveText('1 kg')
  })

  test('near-expiry badge appears when the warning window covers the best-before date', async ({ page }) => {
    const admin = adminClient()
    const { data: before } = await admin.from('settings').select('best_before_warning_days').single()
    try {
      await admin.from('settings').update({ best_before_warning_days: 30 }).eq('id', true)
      await loginAs(page, 'picker')
      await page.goto('/admin/stock')
      await expect(page.getByTestId('stock-row').filter({ hasText: lot })).toContainText('Går ut snart')
    } finally {
      await admin.from('settings').update({ best_before_warning_days: before!.best_before_warning_days }).eq('id', true)
    }
  })

  test('stock past its best-before date is marked Utgått instead of Går ut snart', async ({ page }) => {
    const admin = adminClient()
    const { data: batch } = await admin.from('batches').select('id').eq('lot_number', lot).single()
    const { data: packings } = await admin.from('packings').select('id, best_before').eq('batch_id', batch!.id)
    try {
      await admin.from('packings').update({ best_before: '2020-01-01' }).eq('batch_id', batch!.id)
      await loginAs(page, 'picker')
      await page.goto('/admin/stock')
      const row = page.getByTestId('stock-row').filter({ hasText: lot })
      await expect(row).toContainText('Utgått')
      await expect(row).not.toContainText('Går ut snart')
    } finally {
      for (const p of packings!) await admin.from('packings').update({ best_before: p.best_before }).eq('id', p.id)
    }
  })

  test('seller sees stock but no waste or pack forms', async ({ page }) => {
    await loginAs(page, 'seller')
    await page.goto('/admin/stock')
    await expect(page.getByTestId('stock-row').filter({ hasText: lot })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Registrer svinn' })).toHaveCount(0)
    await page.goto(url)
    await expect(page.getByTestId('pack-form')).toHaveCount(0)
    await expect(page.getByTestId('loose-waste-form')).toHaveCount(0)
  })
})
