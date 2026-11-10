import path from 'node:path'
import { expect, test } from '@playwright/test'
import { adminClient, E2E_PLACE_PREFIX, isoInDays, loginAs } from './helpers'

const RECEIPT = path.join(__dirname, 'fixtures', 'receipt.jpg')
const stamp = Date.now()
const place = `${E2E_PLACE_PREFIX}Regnskap ${stamp}`

test.use({ viewport: { width: 390, height: 844 } })

test.describe.serial('regnskap forms', () => {
  test.beforeAll(async () => {
    const { error } = await adminClient().from('market_days').insert({
      market_date: isoInDays(-2),
      starts_at: '10:00',
      ends_at: '15:00',
      place_name: place,
      address: 'Testgata 1',
      published: false,
    })
    if (error) throw error
  })

  test('seller registers daily takings with a report photo', async ({ page }) => {
    await loginAs(page, 'seller')
    await page.goto('/admin/regnskap/dagsoppgjor')
    const form = page.getByTestId('takings-form')
    const dayValue = await form.locator('option', { hasText: place }).getAttribute('value')
    await form.getByLabel('Markedsdag').selectOption(dayValue!)
    await form.getByLabel('Vipps (kr)').fill('4350')
    await form.getByLabel('Kort (kr)').fill('2100,50')
    await expect(page.getByTestId('takings-total')).toHaveText(/Totalt kr 6\s450,50/)
    await form.getByLabel('Ta bilde').setInputFiles(RECEIPT)
    await form.getByRole('button', { name: 'Lagre' }).click()
    await expect(page.getByTestId('ledger-saved')).toHaveText(/Registrert som R-\d{4}-\d{3,}, R-\d{4}-\d{3,}/)

    // The day is no longer offered.
    await page.reload()
    await expect(page.getByTestId('takings-form').getByRole('option', { name: new RegExp(place) })).toHaveCount(0)

    const { data } = await adminClient()
      .from('market_takings')
      .select('id, vipps_ore, card_ore, cash_ore, market_days!inner(place_name)')
      .eq('market_days.place_name', place)
    expect(data).toHaveLength(1)
    expect(data![0]).toMatchObject({ vipps_ore: 435000, card_ore: 210050, cash_ore: 0 })
    const { count } = await adminClient().from('ledger_receipts').select('id', { count: 'exact', head: true }).eq('takings_id', data![0].id)
    expect(count).toBe(1)
  })

  test('seller registers an expense paid privately, once despite a double tap', async ({ page }) => {
    const description = `E2E privat ${stamp}`
    await loginAs(page, 'seller')
    await page.goto('/admin/regnskap/utgift/ny')
    const form = page.getByTestId('expense-form')
    await form.getByLabel('Beløp (kr)').fill('350')
    await form.getByLabel('Kategori').selectOption({ label: 'Standleie' })
    await form.getByLabel('Leverandør').fill('Bondens marked')
    await form.getByLabel('Hva gjelder det?').fill(description)
    await form.getByLabel('Betaling').selectOption({ label: 'Lagt ut privat' })
    await form.getByLabel('Ta bilde').setInputFiles(RECEIPT)
    await form.getByRole('button', { name: 'Lagre' }).dblclick()
    await expect(page.getByTestId('ledger-saved')).toHaveText(/Registrert som R-/)

    const { data } = await adminClient().from('ledger_entries').select('id, amount_ore, payment_method').eq('description', description)
    expect(data).toHaveLength(1)
    expect(data![0]).toMatchObject({ amount_ore: 35000, payment_method: 'private' })

    await page.goto('/admin/regnskap')
    await expect(page.getByTestId('my-entry').filter({ hasText: description })).toContainText('Kvittering')
  })

  test('a bad amount keeps the form filled in', async ({ page }) => {
    await loginAs(page, 'seller')
    await page.goto('/admin/regnskap/utgift/ny')
    const form = page.getByTestId('expense-form')
    await form.getByLabel('Beløp (kr)').fill('1.234,50')
    await form.getByLabel('Kategori').selectOption({ label: 'Emballasje' })
    await form.getByLabel('Hva gjelder det?').fill('Poser')
    await form.getByRole('button', { name: 'Lagre' }).click()
    await expect(form.getByRole('alert')).toHaveText('Skriv beløpet i kroner, for eksempel 1250,50.')
    await expect(form.getByLabel('Hva gjelder det?')).toHaveValue('Poser')
  })

  test('owner registers other income; sellers cannot open that page', async ({ page }) => {
    const description = `E2E restaurant ${stamp}`
    await loginAs(page, 'owner')
    await page.goto('/admin/regnskap/inntekt/ny')
    const form = page.getByTestId('income-form')
    await form.getByLabel('Beløp (kr)').fill('1 200')
    await form.getByLabel('Kategori').selectOption({ label: 'Salg restaurant/butikk' })
    await form.getByLabel('Kunde').fill('Restaurant Test')
    await form.getByLabel('Hva gjelder det?').fill(description)
    await form.getByLabel('Betaling').selectOption({ label: 'Bank' })
    await form.getByRole('button', { name: 'Lagre' }).click()
    await expect(page.getByTestId('ledger-saved')).toHaveText(/Registrert som R-/)

    await loginAs(page, 'seller')
    const res = await page.goto('/admin/regnskap/inntekt/ny')
    expect(res?.status()).toBe(404)
  })
})
