import { expect, test } from '@playwright/test'
import { loginAs } from './helpers'

test.describe('Regnskap overview', () => {
  test('picker has no Regnskap tab and gets 404', async ({ page }) => {
    await loginAs(page, 'picker')
    await expect(page.getByRole('link', { name: 'Regnskap' })).toHaveCount(0)
    const res = await page.goto('/admin/regnskap')
    expect(res?.status()).toBe(404)
  })

  test('seller sees the two actions and own entries, no figures', async ({ page }) => {
    await loginAs(page, 'seller')
    await page.goto('/admin/regnskap')
    await expect(page.getByRole('heading', { name: 'Regnskap', level: 1 })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Dagsoppgjør' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Ny utgift' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Mine registreringer' })).toBeVisible()
    await expect(page.getByText('Resultat')).toHaveCount(0)
    await expect(page.getByTestId('mva-meter')).toHaveCount(0)
  })

  test('owner sees totals, follow-ups and the MVA meter', async ({ page }) => {
    await loginAs(page, 'owner')
    await page.goto('/admin/regnskap')
    await expect(page.getByText('Resultat').first()).toBeVisible()
    await expect(page.getByTestId('month-expense')).toHaveText(/^kr /)
    await expect(page.getByTestId('missing-receipts')).toContainText('Mangler kvittering')
    await expect(page.getByTestId('unpaid')).toContainText('Ubetalte regninger')
    await expect(page.getByTestId('owed-back')).toContainText('Skyldes tilbake')
    const meter = page.getByTestId('mva-meter')
    await expect(meter).toContainText('Grensen gjelder hele DONTPANIC AS – ta med annen omsetning.')
    await expect(meter.getByRole('meter')).toBeVisible()
  })
})
