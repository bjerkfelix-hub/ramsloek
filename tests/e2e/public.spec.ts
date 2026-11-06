import { expect, test } from '@playwright/test'
import { adminClient, deleteTestMarketDays, E2E_PLACE_PREFIX, isoInDays, loginAs } from './helpers'

const stamp = Date.now()
const place = `${E2E_PLACE_PREFIX}Torget ${stamp}`
const cancelledPlace = `${E2E_PLACE_PREFIX}Avlyst torg ${stamp}`

test.beforeAll(async () => {
  await deleteTestMarketDays()
  const { error } = await adminClient()
    .from('market_days')
    .insert([
      {
        market_date: isoInDays(3),
        starts_at: '10:00',
        ends_at: '15:00',
        place_name: place,
        address: 'Torget 1, 1450 Nesoddtangen',
        note_no: 'Ved fontenen',
        note_en: 'By the fountain',
        cancelled: false,
      },
      {
        market_date: isoInDays(4),
        starts_at: '10:00',
        ends_at: '14:00',
        place_name: cancelledPlace,
        address: 'Torget 2, Oslo',
        note_no: null,
        note_en: null,
        cancelled: true,
      },
    ])
  if (error) throw error
})

test.afterAll(deleteTestMarketDays)

test('signed-out front page shows the wordmark, season banner and upcoming markets', async ({ page }) => {
  const res = await page.goto('/')
  expect(res?.status()).toBe(200)
  await expect(page.locator('html')).toHaveAttribute('lang', 'nb')
  await expect(page.getByRole('link', { name: 'Nesodden Ramsløk' }).first()).toBeVisible()
  await expect(page.getByTestId('season-banner')).toContainText('I sesong – neste marked:')

  const market = page.getByRole('listitem').filter({ hasText: place })
  await expect(market).toBeVisible()
  await expect(market).toContainText('kl. 10–15')
  await expect(market).toContainText('Ved fontenen')
  await expect(market.getByRole('link', { name: /Vis i kart/ })).toHaveAttribute(
    'href',
    'https://www.google.com/maps/search/?api=1&query=Torget%201%2C%201450%20Nesoddtangen',
  )
  await expect(page.getByRole('listitem').filter({ hasText: cancelledPlace })).toContainText('Avlyst')
  await expect(page.getByRole('link', { name: 'Se alle markedsdager' })).toHaveAttribute('href', '/marked')
  await expect(page.getByRole('contentinfo').getByRole('link', { name: 'post@ramsløk.no' })).toHaveAttribute(
    'href',
    'mailto:post@xn--ramslk-fya.no',
  )
})

test('English front page shows the English banner and the same markets', async ({ page }) => {
  await page.goto('/en')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page.getByTestId('season-banner')).toContainText('In season – next market:')
  const market = page.getByRole('listitem').filter({ hasText: place })
  await expect(market).toBeVisible()
  await expect(market).toContainText('By the fountain')
  await expect(page.getByRole('listitem').filter({ hasText: cancelledPlace })).toContainText('Cancelled')
  await expect(page.getByRole('link', { name: 'See all market days' })).toHaveAttribute('href', '/en/markets')
})

test('language switch links between / and /en', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('banner').getByRole('link', { name: 'English' }).click()
  await page.waitForURL((u) => u.pathname === '/en')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Wild garlic from Nesodden')
  await page.getByRole('banner').getByRole('link', { name: 'Norsk' }).click()
  await page.waitForURL((u) => u.pathname === '/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ramsløk fra Nesodden')
})

test('public pages do not set cookies', async ({ page, context }) => {
  await page.goto('/')
  await page.goto('/en')
  expect(await context.cookies()).toEqual([])
})

test('unknown path shows a Norwegian 404 page', async ({ page }) => {
  const res = await page.goto('/finnes-ikke')
  expect(res?.status()).toBe(404)
  await expect(page.locator('html')).toHaveAttribute('lang', 'nb')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Siden finnes ikke')
  await expect(page.getByRole('main').getByRole('link', { name: 'Til forsiden' })).toHaveAttribute('href', '/')
})

test('unknown English path shows an English 404 page', async ({ page }) => {
  const res = await page.goto('/en/does-not-exist')
  expect(res?.status()).toBe(404)
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page not found')
  await expect(page.getByRole('main').getByRole('link', { name: 'Back to the front page' })).toHaveAttribute('href', '/en')
})

test('a market day added or edited in admin shows on the front page straight away', async ({ page }) => {
  const adminPlace = `${E2E_PLACE_PREFIX}Admin torg ${stamp}`
  await loginAs(page, 'owner')
  await page.goto('/admin/marked')
  const form = page.locator('form:has(input[name="date"])')
  await form.getByLabel('Dato').fill(isoInDays(2))
  await form.getByLabel('Fra').fill('09:00')
  await form.getByLabel('Til').fill('13:00')
  await form.getByLabel('Sted').fill(adminPlace)
  await form.getByLabel('Adresse').fill('Torget 3, Oslo')
  await form.getByRole('button', { name: 'Lagre' }).click()
  await expect(page.getByRole('listitem').filter({ hasText: adminPlace })).toBeVisible()

  await page.goto('/')
  await expect(page.getByRole('listitem').filter({ hasText: adminPlace })).toContainText('kl. 9–13')

  await page.goto('/admin/marked')
  await page.getByRole('listitem').filter({ hasText: adminPlace }).getByRole('link', { name: 'Rediger' }).click()
  await page.waitForURL(/edit=/)
  const edit = page.locator('form:has(input[name="date"])')
  await edit.getByLabel('Til').fill('14:30')
  await edit.getByRole('button', { name: 'Lagre' }).click()
  await expect(edit.getByRole('status')).toHaveText('Lagret.')

  await page.goto('/')
  await expect(page.getByRole('listitem').filter({ hasText: adminPlace })).toContainText('kl. 9–14:30')
  await page.goto('/en')
  await expect(page.getByRole('listitem').filter({ hasText: adminPlace })).toContainText('9–14:30')
})
