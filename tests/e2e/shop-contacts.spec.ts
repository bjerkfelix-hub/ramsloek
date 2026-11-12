import { expect, test, type Page } from '@playwright/test'
import { adminClient, loginAs } from './helpers'
import { submitPlanning } from './planning-helpers'
const stamp = Date.now()
let count = 0
const email = () => `shop-e2e-${stamp}-${count++}@example.test`
const product = `E2E shop ${stamp}`
const checked = <T extends { error: unknown }>(result: T): T => { if (result.error) throw result.error; return result }

test.beforeAll(async () => {
  checked(await adminClient().from('products').insert([
    { name: product, net_weight_g: 123, unit_kind: 'consumer', shelf_life_days: 5, active: true },
    { name: `${product} hidden`, net_weight_g: 456, unit_kind: 'consumer', shelf_life_days: 5, active: false },
    { name: `${product} trade`, net_weight_g: 789, unit_kind: 'trade', shelf_life_days: 5, active: true },
  ]))
})
test.beforeEach(async ({ page }, info) => {
  await page.setExtraHTTPHeaders({ 'x-real-ip': `shop-${stamp}-${info.title}` })
})
test.afterAll(async () => {
  for (const table of ['consumer_interests', 'business_inquiries']) checked(await adminClient().from(table).delete().like('email', `shop-e2e-${stamp}-%`))
  checked(await adminClient().from('products').delete().like('name', `${product}%`))
})
async function row(table: string, address: string) { return checked(await adminClient().from(table).select('*').eq('email', address).maybeSingle()).data }
async function fillInterest(page: Page, address: string, en = false) {
  await page.getByLabel(en ? 'Name' : 'Navn', { exact: true }).fill('Ola Interesse')
  await page.getByLabel(en ? 'Email address' : 'E-postadresse', { exact: true }).fill(address)
  await page.getByLabel(en ? 'Number of bags' : 'Antall poser').fill('3')
  await page.getByRole('checkbox').check()
}
async function fillInquiry(page: Page, address: string, en = false) {
  await page.getByLabel(en ? 'Company' : 'Bedrift', { exact: true }).fill(`E2E Kjøkkenet ${stamp}`)
  await page.getByLabel(en ? 'Contact name' : 'Kontaktperson', { exact: true }).fill('Ola Restaurant')
  await page.getByLabel(en ? 'Email address' : 'E-postadresse', { exact: true }).fill(address)
  await page.getByLabel(en ? 'Message' : 'Melding', { exact: true }).fill('Vi ønsker fersk ramsløk til kjøkkenet.')
  await page.getByRole('checkbox').check()
}
for (const en of [false, true]) {
  test(`shop products, links, metadata and mobile layout ${en ? 'en' : 'no'}`, async ({ page }) => {
    const path = en ? '/en/shop' : '/butikken'
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(path)
    await expect(page.getByRole('heading', { name: en ? 'Shop' : 'Butikken', exact: true })).toBeVisible()
    await expect(page.getByText(product, { exact: true })).toBeVisible()
    await expect(page.getByText('123 g', { exact: true })).toBeVisible()
    await expect(page.getByText(`${product} hidden`, { exact: true })).toHaveCount(0)
    await expect(page.getByText(`${product} trade`, { exact: true })).toHaveCount(0)
    await expect(page.locator('main').getByRole('link', { name: en ? 'Register interest' : 'Meld interesse', exact: true })).toHaveAttribute('href', en ? '/en/interest' : '/interesse')
    await expect(page.locator('main').getByRole('link', { name: en ? 'For restaurants and wholesalers' : 'For restauranter og grossister' })).toHaveAttribute('href', en ? '/en/wholesale' : '/grossist')
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://xn--ramslk-fya.no${path}`)
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      const links = await page.locator('main a, nav a, body > header a, footer a').evaluateAll(elements => elements.map(element => element.getBoundingClientRect().height))
      expect(links.every(height => height >= 44)).toBe(true)
    }
    await page.goto(en ? '/en' : '/')
    await expect(page.locator('main').getByRole('link', { name: en ? 'Shop' : 'Butikken', exact: true })).toHaveAttribute('href', path)
  })
  test(`interest success and duplicate email updates ${en ? 'en' : 'no'}`, async ({ page }) => {
    const address = email()
    const path = en ? '/en/interest' : '/interesse'
    await page.goto(path)
    await fillInterest(page, address, en)
    await submitPlanning(page.getByRole('button', { name: en ? 'Submit' : 'Send inn', exact: true }))
    await expect(page.getByTestId('contact-success')).toBeVisible()
    const first = await row('consumer_interests', address)
    expect(first?.language).toBe(en ? 'en' : 'no')
    expect(first?.consent_text).toContain(en ? 'I consent' : 'Jeg samtykker')
    await page.goto(path)
    await fillInterest(page, address, en)
    await page.getByLabel(en ? 'Number of bags' : 'Antall poser').fill('7')
    await submitPlanning(page.getByRole('button', { name: en ? 'Submit' : 'Send inn', exact: true }))
    await expect(page.getByTestId('contact-success')).toBeVisible()
    expect((await row('consumer_interests', address))?.id).toBe(first.id)
    expect((await row('consumer_interests', address))?.bags).toBe(7)
  })
  test(`wholesale saves successfully with email service unconfigured ${en ? 'en' : 'no'}`, async ({ page }) => {
    const address = email()
    await page.goto(en ? '/en/wholesale' : '/grossist')
    await fillInquiry(page, address, en)
    await submitPlanning(page.getByRole('button', { name: en ? 'Submit' : 'Send inn', exact: true }))
    await expect(page.getByTestId('contact-success')).toBeVisible()
    expect((await row('business_inquiries', address))?.language).toBe(en ? 'en' : 'no')
  })
}

test('interest server validation, consent and rate limiting', async ({ page }) => {
  await page.goto('/interesse')
  await fillInterest(page, email())
  await page.locator('form').evaluate(form => form.setAttribute('novalidate', ''))
  const button = page.getByRole('button', { name: 'Send inn', exact: true })
  await page.getByLabel('Antall poser').fill('51')
  await submitPlanning(button)
  await expect(page.getByTestId('contact-error')).toHaveText('Velg et helt antall poser fra 1 til 50.')
  await expect(page.getByLabel('Navn', { exact: true })).toHaveValue('Ola Interesse')
  await page.getByLabel('Antall poser').fill('3')
  await page.getByRole('checkbox').uncheck()
  await submitPlanning(button)
  await expect(page.getByTestId('contact-error')).toHaveText('Du må samtykke for å melde deg på.')
  await page.getByRole('checkbox').check()
  await page.getByLabel('E-postadresse', { exact: true }).fill('bad')
  for (let i = 0; i < 3; i++) {
    await submitPlanning(button)
    await expect(page.getByTestId('contact-error')).toHaveText('Skriv en gyldig e-postadresse.')
  }
  await submitPlanning(button)
  await expect(page.getByTestId('contact-error')).toHaveText('Prøv igjen litt senere.')
})
for (const kind of ['interest', 'wholesale'] as const) {
  test(`${kind} honeypot stores nothing and mobile form fits`, async ({ page }) => {
    const address = email()
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(kind === 'interest' ? '/interesse' : '/grossist')
    if (kind === 'interest') await fillInterest(page, address)
    else await fillInquiry(page, address)
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      expect(await page.locator('main input:not([type="hidden"]):not([type="checkbox"]):not([name="hp_extra_field"]), main select, main textarea, main button, main a, main label:has(input[type="checkbox"])').evaluateAll(elements => elements.every(element => element.getBoundingClientRect().height >= 44))).toBe(true)
    }
    await page.locator('[name="hp_extra_field"]').evaluate((element: HTMLInputElement) => { element.value = 'spam' })
    await submitPlanning(page.getByRole('button', { name: 'Send inn', exact: true }))
    await expect(page.getByTestId('contact-success')).toBeVisible()
    expect(await row(kind === 'interest' ? 'consumer_interests' : 'business_inquiries', address)).toBeNull()
  })
}

test('owner lists, answers, undo and deletes; picker and seller denied', async ({ page, browser }) => {
  const interestEmail = email(), inquiryEmail = email()
  await page.goto('/interesse'); await fillInterest(page, interestEmail)
  await submitPlanning(page.getByRole('button', { name: 'Send inn', exact: true }))
  await expect(page.getByTestId('contact-success')).toBeVisible()
  await page.goto('/grossist'); await fillInquiry(page, inquiryEmail)
  await submitPlanning(page.getByRole('button', { name: 'Send inn', exact: true }))
  await expect(page.getByTestId('contact-success')).toBeVisible()
  await loginAs(page, 'owner')
  await page.goto('/admin/pameldinger')
  await page.getByRole('link', { name: 'Interesse', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Interesse', exact: true })).toBeVisible()
  const interests = checked(await adminClient().from('consumer_interests').select('bags')).data ?? []
  await expect(page.getByTestId('total-bags')).toHaveText(String(interests.reduce((sum, interest) => sum + interest.bags, 0)))
  const interestRow = page.getByTestId('contact-row').filter({ hasText: interestEmail })
  await expect(interestRow).toContainText('Ola Interesse')
  page.once('dialog', dialog => dialog.dismiss())
  await interestRow.getByRole('button', { name: 'Slett', exact: true }).click()
  await expect(interestRow).toBeVisible()
  expect(await row('consumer_interests', interestEmail)).not.toBeNull()
  page.on('dialog', dialog => dialog.accept())
  await submitPlanning(interestRow.getByRole('button', { name: 'Slett', exact: true }))
  await expect(interestRow).toHaveCount(0)
  expect(await row('consumer_interests', interestEmail)).toBeNull()
  await page.getByRole('link', { name: 'Henvendelser', exact: true }).click()
  const inquiryRow = page.getByTestId('contact-row').filter({ hasText: inquiryEmail })
  await submitPlanning(inquiryRow.getByRole('button', { name: 'Marker som besvart' }))
  await expect(inquiryRow.getByRole('button', { name: 'Angre besvart' })).toBeVisible()
  expect((await row('business_inquiries', inquiryEmail))?.answered_by).toBeTruthy()
  await submitPlanning(inquiryRow.getByRole('button', { name: 'Angre besvart' }))
  expect((await row('business_inquiries', inquiryEmail))?.answered_at).toBeNull()
  await submitPlanning(inquiryRow.getByRole('button', { name: 'Slett', exact: true }))
  await expect(inquiryRow).toHaveCount(0)
  expect(await row('business_inquiries', inquiryEmail)).toBeNull()
  for (const role of ['picker', 'seller'] as const) {
    const context = await browser.newContext()
    const visitor = await context.newPage()
    await loginAs(visitor, role)
    for (const path of ['interesse', 'henvendelser']) expect((await visitor.goto(`/admin/pameldinger/${path}`))?.status()).toBe(404)
    await context.close()
  }
})
