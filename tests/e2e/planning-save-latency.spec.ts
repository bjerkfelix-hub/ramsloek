import { expect, type Page } from '@playwright/test'
import { test, planningUser, loginPlanning, submitPlanning } from './planning-helpers'

// Hold the real action response, including revalidated RSC, until explicitly released.
// This models a slow compile/response without sleeps or changing the application.
async function holdAction(page: Page) {
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  await page.route('**/admin/**', async route => {
    const request = route.request()
    if (request.method() !== 'POST' || !request.headers()['next-action']) return route.continue()
    const response = await route.fetch()
    await gate
    await route.fulfill({ response })
  })
  return release
}

for (const kind of ['rate sheet', 'desktop shift'] as const) test(`${kind} waits for a slow action response before asserting saved UI`, async ({ page }) => {
  const owner = await planningUser('owner')
  await loginPlanning(page, owner.email)
  await page.goto(kind === 'rate sheet' ? '/admin/users' : '/admin/vaktplan?week=2035-01-01')
  if (kind === 'rate sheet') {
    await page.getByRole('row').filter({ hasText: owner.label }).getByRole('button', { name: 'Endre timesats' }).click()
    await page.getByRole('dialog').getByLabel('Timesats (kr/time)').fill('250')
  } else {
    await page.getByLabel('Person').selectOption(owner.id)
    await page.getByLabel('Notat').fill(`E2E delayed ${owner.id}`)
  }
  const form = kind === 'rate sheet' ? page.getByRole('dialog') : page.locator('form').filter({ has: page.getByLabel('Notat') })
  const button = form.getByRole('button', { name: 'Lagre', exact: true })
  const release = await holdAction(page)
  let completed = false
  const save = submitPlanning(button).then(() => { completed = true })
  try {
    await expect(button).toBeDisabled()
    // Reproduce the old assertion failure at its actual five-second boundary.
    // The response-aware save must still be waiting when that assertion expires.
    const legacyAssertion = kind === 'rate sheet'
      ? expect(page.getByRole('dialog')).not.toBeVisible()
      : expect(page.getByRole('button', { name: new RegExp(`E2E delayed ${owner.id}`) })).toBeVisible()
    await expect(legacyAssertion).rejects.toThrow(/5000ms/)
    expect(completed).toBe(false)
  } finally { release(); await save }
  if (kind === 'rate sheet') await expect(page.getByRole('dialog')).not.toBeVisible()
  else await expect(page.getByRole('button', { name: new RegExp(`E2E delayed ${owner.id}`) })).toBeVisible()
})
