import { expect, test } from '@playwright/test'
import { loginAs } from './helpers'

const stamp = Date.now()

function isoInDays(days: number): string {
  const d = new Date(Date.now() + days * 86400000)
  return d.toISOString().slice(0, 10)
}

test('owner adds, edits, cancels and restores a market day', async ({ page }) => {
  const place = `Bondens marked Test ${stamp}`
  await loginAs(page, 'owner')
  await page.goto('/admin/marked')

  const form = page.locator('form:has(input[name="date"])')
  await form.getByLabel('Dato').fill(isoInDays(7))
  await form.getByLabel('Fra').fill('10:00')
  await form.getByLabel('Til').fill('15:00')
  await form.getByLabel('Sted').fill(place)
  await form.getByLabel('Adresse').fill('Torget 1, Nesodden')
  await form.getByRole('button', { name: 'Lagre' }).click()

  const item = page.getByRole('listitem').filter({ hasText: place })
  await expect(item).toBeVisible()
  await expect(item).toContainText('10:00–15:00')

  await item.getByRole('link', { name: 'Rediger' }).click()
  await page.waitForURL(/edit=/)
  const edit = page.locator('form:has(input[name="date"])')
  await expect(edit.getByLabel('Sted')).toHaveValue(place)
  await edit.getByLabel('Til').fill('16:30')
  await edit.getByRole('button', { name: 'Lagre' }).click()
  await expect(edit.getByRole('status')).toHaveText('Lagret.')
  await page.goto('/admin/marked')
  await expect(page.getByRole('listitem').filter({ hasText: place })).toContainText('10:00–16:30')

  const row = page.getByRole('listitem').filter({ hasText: place })
  await row.getByRole('button', { name: 'Avlys' }).click()
  await expect(row).toContainText('Avlyst')
  await row.getByRole('button', { name: 'Gjenopprett' }).click()
  await expect(row).not.toContainText('Avlyst')
  await expect(row.getByRole('button', { name: 'Avlys' })).toBeVisible()
})

test('ends before starts, or missing fields, show an error', async ({ page }) => {
  await loginAs(page, 'owner')
  await page.goto('/admin/marked')
  const form = page.locator('form:has(input[name="date"])')
  await form.getByLabel('Dato').fill(isoInDays(8))
  await form.getByLabel('Fra').fill('15:00')
  await form.getByLabel('Til').fill('10:00')
  await form.getByLabel('Sted').fill(`Feil tid ${stamp}`)
  await form.getByLabel('Adresse').fill('Torget 1')
  await form.getByRole('button', { name: 'Lagre' }).click()
  await expect(form.getByRole('alert')).toHaveText('Sluttid må være etter starttid.')

  await form.getByLabel('Til').fill('')
  await form.getByRole('button', { name: 'Lagre' }).click()
  await expect(form.getByRole('alert')).toHaveText('Fyll inn dato, tid, sted og adresse.')
})

for (const role of ['picker', 'seller'] as const) {
  test(`${role} opening /admin/marked gets 404`, async ({ page }) => {
    await loginAs(page, role)
    const res = await page.goto('/admin/marked')
    expect(res?.status()).toBe(404)
  })
}
