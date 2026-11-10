import { expect, test, type Page } from '@playwright/test'
import { todayOslo } from '../../src/lib/domain/time'
import { adminClient, E2E_PLACE_PREFIX, isoInDays, loginAs } from './helpers'

const stamp = Date.now()
let ownerId: string
let sellerId: string
let editId: string
let privateId: string
let takingsEntryId: string
let takingsId: string

async function categoryId(name: string): Promise<string> {
  const { data, error } = await adminClient().from('ledger_categories').select('id').eq('name', name).single()
  if (error) throw error
  return data.id
}

/** Parses "kr 1 234,50" (with any space kind) to øre. */
function toOre(text: string): number {
  const n = text.replace(/[^\d,]/g, '').replace(',', '.')
  return Math.round(Number(n) * 100)
}

async function monthExpense(page: Page): Promise<number> {
  await page.goto('/admin/regnskap')
  return toOre((await page.getByTestId('month-expense').textContent()) ?? '')
}

test.describe.serial('regnskap entries and categories', () => {
  test.beforeAll(async () => {
    const admin = adminClient()
    const { data: users } = await admin.auth.admin.listUsers()
    ownerId = users!.users.find((u) => u.email === 'eier@test.local')!.id
    sellerId = users!.users.find((u) => u.email === 'selger@test.local')!.id
    const packaging = await categoryId('Emballasje')
    const stand = await categoryId('Standleie')

    const { data: e1, error: err1 } = await admin
      .from('ledger_entries')
      .insert({ kind: 'expense', entry_date: todayOslo(), category_id: packaging, amount_ore: 10000, description: `E2E edit ${stamp}`, payment_method: 'card', created_by: ownerId })
      .select('id')
      .single()
    if (err1) throw err1
    editId = e1.id

    const { data: e2, error: err2 } = await admin
      .from('ledger_entries')
      .insert({ kind: 'expense', entry_date: todayOslo(), category_id: stand, amount_ore: 35000, description: `E2E privat ${stamp}`, payment_method: 'private', created_by: sellerId })
      .select('id')
      .single()
    if (err2) throw err2
    privateId = e2.id

    const { data: day, error: dayErr } = await admin
      .from('market_days')
      .insert({ market_date: isoInDays(-1), starts_at: '10:00', ends_at: '15:00', place_name: `${E2E_PLACE_PREFIX}Poster ${stamp}`, address: 'Testgata 2', published: false })
      .select('id')
      .single()
    if (dayErr) throw dayErr
    const { data: t, error: tErr } = await admin
      .from('market_takings')
      .insert({ market_day_id: day.id, vipps_ore: 100000, card_ore: 50000, created_by: sellerId })
      .select('id')
      .single()
    if (tErr) throw tErr
    takingsId = t.id
    const { data: te } = await admin.from('ledger_entries').select('id').eq('takings_id', takingsId).order('number').limit(1).single()
    takingsEntryId = te!.id
  })

  test('owner finds an entry without receipt, corrects it and sees the history', async ({ page }) => {
    await loginAs(page, 'owner')
    await page.goto('/admin/regnskap/poster?flag=missing-receipt')
    await expect(page.getByTestId('entry-row').filter({ hasText: `E2E edit ${stamp}` })).toContainText('Mangler kvittering')

    await page.goto(`/admin/regnskap/poster/${editId}`)
    await page.getByRole('link', { name: 'Rediger' }).click()
    const form = page.getByTestId('edit-entry-form')
    await form.getByLabel('Beløp (kr)').fill('120')
    await form.getByRole('button', { name: 'Lagre' }).click()
    await expect(form.getByText('Endringen er lagret.')).toBeVisible()

    await page.goto(`/admin/regnskap/poster/${editId}`)
    await expect(page.getByTestId('entry-amount')).toHaveText(/kr 120,00/)
    await expect(page.getByTestId('entry-history')).toContainText(/Beløp: kr 100,00 → kr 120,00/)
  })

  test('voiding removes the entry from the totals', async ({ page }) => {
    await loginAs(page, 'owner')
    const before = await monthExpense(page)
    await page.goto(`/admin/regnskap/poster/${editId}`)
    const form = page.getByTestId('void-form')
    await form.getByLabel('Grunn').fill('E2E test')
    await form.getByRole('button', { name: 'Annuller' }).click()
    await expect(page.getByRole('note')).toContainText('Annullert: E2E test')
    expect(await monthExpense(page)).toBe(before - 12000)

    // Voided entries are hidden by default and shown on request.
    await page.goto('/admin/regnskap/poster')
    await expect(page.getByTestId('entry-row').filter({ hasText: `E2E edit ${stamp}` })).toHaveCount(0)
    await page.goto('/admin/regnskap/poster?voided=1')
    await expect(page.getByTestId('entry-row').filter({ hasText: `E2E edit ${stamp}` })).toContainText('Annullert')
  })

  test('money laid out privately is marked repaid', async ({ page }) => {
    await loginAs(page, 'owner')
    await page.goto('/admin/regnskap/poster?flag=private')
    await expect(page.getByTestId('entry-row').filter({ hasText: `E2E privat ${stamp}` })).toHaveCount(1)
    await page.goto(`/admin/regnskap/poster/${privateId}`)
    await page.getByRole('button', { name: 'Marker tilbakebetalt' }).click()
    await expect(page.getByRole('button', { name: 'Marker tilbakebetalt' })).toHaveCount(0)
    await page.goto('/admin/regnskap/poster?flag=private')
    await expect(page.getByTestId('entry-row').filter({ hasText: `E2E privat ${stamp}` })).toHaveCount(0)
  })

  test('voiding a takings entry voids the whole daily takings', async ({ page }) => {
    await loginAs(page, 'owner')
    await page.goto(`/admin/regnskap/poster/${takingsEntryId}`)
    await expect(page.getByRole('heading', { name: 'Fra dagsoppgjør' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Rediger' })).toHaveCount(0)
    const form = page.getByTestId('void-form')
    await form.getByLabel('Grunn').fill('Feil dag')
    await form.getByRole('button', { name: 'Annuller dagsoppgjør' }).click()
    await expect(page.getByRole('note')).toContainText('Annullert: Feil dag')
    const { data } = await adminClient().from('ledger_entries').select('voided_at').eq('takings_id', takingsId)
    expect(data).toHaveLength(2)
    expect(data!.every((e) => e.voided_at !== null)).toBe(true)
  })

  test('owner adds, renames and deactivates a category', async ({ page }) => {
    const name = `E2E Kategori ${stamp}`
    await loginAs(page, 'owner')
    await page.goto('/admin/regnskap/kategorier')
    await expect(page.getByTestId('category-row').filter({ hasText: 'Salg marked' })).toContainText('Brukes av dagsoppgjør')

    const add = page.getByTestId('new-category-form').first()
    await add.getByLabel('Navn').fill(name)
    await add.getByLabel('Konto').fill('6550')
    await add.getByRole('button', { name: 'Legg til' }).click()
    await expect(page.getByTestId('category-row').filter({ hasText: name })).toContainText('6550')

    const row = page.getByTestId('category-row').filter({ hasText: name })
    await row.getByText('Endre').click()
    await row.getByLabel('Navn').fill(`${name} ny`)
    await row.getByRole('button', { name: 'Lagre' }).click()
    await expect(page.getByTestId('category-row').filter({ hasText: `${name} ny` })).toHaveCount(1)

    await page.getByRole('button', { name: `Skru av ${name} ny` }).click()
    await expect(page.getByTestId('category-row').filter({ hasText: `${name} ny` })).toContainText('Av')
    await page.goto('/admin/regnskap/utgift/ny')
    await expect(page.getByTestId('expense-form').getByRole('option', { name: `${name} ny` })).toHaveCount(0)
  })

  test('sellers cannot open entries or categories', async ({ page }) => {
    await loginAs(page, 'seller')
    for (const url of ['/admin/regnskap/poster', `/admin/regnskap/poster/${privateId}`, '/admin/regnskap/kategorier']) {
      const res = await page.goto(url)
      expect(res?.status(), url).toBe(404)
    }
  })
})
