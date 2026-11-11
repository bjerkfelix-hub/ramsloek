import { expect, test, type Page } from '@playwright/test'
import { loginAs } from './helpers'

const PHONE = { width: 390, height: 844 }
const stamp = Date.now()

async function themeCookie(page: Page) {
  return (await page.context().cookies()).find((c) => c.name === 'theme')
}

test.describe('theme', () => {
  test('owner picks Mørk on the settings page and it persists after reload', async ({ page }) => {
    await loginAs(page, 'owner')
    await page.goto('/admin/settings')
    const html = page.locator('html')
    await expect(html).toHaveAttribute('data-theme', 'system')
    await page.getByRole('main').getByRole('radio', { name: 'Mørk' }).check()
    await expect(html).toHaveAttribute('data-theme', 'dark')
    await expect.poll(async () => (await themeCookie(page))?.value).toBe('dark')
    const cookie = (await themeCookie(page))!
    expect(cookie.path).toBe('/admin')
    // About one year.
    expect(cookie.expires * 1000 - Date.now()).toBeGreaterThan(360 * 86400000)
    await page.reload()
    await expect(html).toHaveAttribute('data-theme', 'dark')
    await expect(page.getByRole('main').getByRole('radio', { name: 'Mørk' })).toBeChecked()
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(0, 0, 0)')

    await page.getByRole('main').getByRole('radio', { name: 'Lys' }).check()
    await expect(html).toHaveAttribute('data-theme', 'light')
    await expect.poll(async () => (await themeCookie(page))?.value).toBe('light')
    await page.reload()
    await expect(html).toHaveAttribute('data-theme', 'light')
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(242, 242, 247)')
  })

  test.describe('device in dark mode', () => {
    test.use({ colorScheme: 'dark' })

    test('System follows the device and renders dark tokens', async ({ page }) => {
      await loginAs(page, 'picker')
      await page.goto('/admin/batches')
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'system')
      await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(0, 0, 0)')
    })
  })
})

test('saving a form shows the Lagret ✓ toast', async ({ page }) => {
  await loginAs(page, 'owner')
  await page.goto('/admin/settings')
  await page.getByRole('button', { name: 'Lagre' }).click()
  await expect(page.locator('form').getByRole('status')).toHaveText('Lagret.')
  await expect(page.getByRole('status').filter({ hasText: 'Lagret ✓' })).toBeVisible()
})

test.describe('phone', () => {
  test.use({ viewport: PHONE, hasTouch: true })

  test('bottom tab bar with Mer sheet; active tab is marked', async ({ page }) => {
    await loginAs(page, 'owner')
    await page.goto('/admin/batches')
    const nav = page.getByRole('navigation', { name: 'Hovedmeny' })
    await expect(nav).toBeVisible()
    const box = (await nav.boundingBox())!
    expect(box.y + box.height).toBeGreaterThan(PHONE.height - 4)
    for (const name of ['Partier', 'Lager', 'Marked']) await expect(nav.getByRole('link', { name })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Partier' })).toHaveAttribute('aria-current', 'page')
    await expect(nav.getByRole('link', { name: 'Produkter' })).toHaveCount(0)

    const more = nav.getByRole('button', { name: 'Mer' })
    await more.click()
    const sheet = page.getByRole('dialog', { name: 'Mer' })
    await expect(sheet).toBeVisible()
    await expect(sheet).toHaveAttribute('aria-modal', 'true')
    for (const name of ['Produkter', 'Områder', 'Påmeldinger', 'Brukere', 'Innstillinger']) {
      await expect(sheet.getByRole('link', { name })).toBeVisible()
    }
    await expect(sheet.getByRole('radio', { name: 'System' })).toBeChecked()
    await expect(sheet.getByRole('button', { name: 'Logg ut' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(sheet).toHaveCount(0)
    await expect(more).toBeFocused()
  })

  test('picker sees no Marked tab', async ({ page }) => {
    await loginAs(page, 'picker')
    const nav = page.getByRole('navigation', { name: 'Hovedmeny' })
    await expect(nav.getByRole('link', { name: 'Partier' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Lager' })).toBeVisible()
    await expect(nav.getByRole('button', { name: 'Mer' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Marked' })).toHaveCount(0)
    await nav.getByRole('button', { name: 'Mer' }).click()
    const sheet = page.getByRole('dialog', { name: 'Mer' })
    // Pickers get the shared planning pages under Mer, but never owner-only pages.
    await expect(sheet.getByRole('link', { name: 'Vaktplan' })).toBeVisible()
    for (const name of ['Produkter', 'Områder', 'Marked', 'Påmeldinger', 'Brukere', 'Innstillinger', 'Regnskap']) {
      await expect(sheet.getByRole('link', { name })).toHaveCount(0)
    }
    await expect(sheet.getByRole('button', { name: 'Logg ut' })).toBeVisible()
  })

  test('Ny høsting opens a dialog sheet that closes with Escape and returns focus', async ({ page }) => {
    await loginAs(page, 'picker')
    await page.goto('/admin/batches')
    const trigger = page.getByRole('button', { name: 'Ny høsting' })
    await trigger.click()
    const sheet = page.getByRole('dialog', { name: 'Ny høsting' })
    await expect(sheet).toBeVisible()
    await expect(sheet).toHaveAttribute('aria-modal', 'true')
    await expect(sheet.getByLabel('Område')).toBeVisible()
    // Focus stays inside the sheet.
    for (let i = 0; i < 12; i++) await page.keyboard.press('Tab')
    expect(await sheet.evaluate((el) => el.contains(document.activeElement))).toBe(true)
    await page.keyboard.press('Escape')
    await expect(sheet).toHaveCount(0)
    await expect(trigger).toBeFocused()
  })

  test('dragging the sheet down dismisses it', async ({ page }) => {
    await loginAs(page, 'picker')
    await page.goto('/admin/batches')
    await page.getByRole('button', { name: 'Ny høsting' }).click()
    const sheet = page.getByRole('dialog', { name: 'Ny høsting' })
    await expect(sheet).toBeVisible()
    const handle = sheet.getByTestId('sheet-grabber')
    // Wait for the open spring to settle so the drag starts from rest.
    let last = Number.NaN
    await expect
      .poll(async () => {
        const y = (await handle.boundingBox())!.y
        const settled = y === last
        last = y
        return settled
      })
      .toBe(true)
    const box = (await handle.boundingBox())!
    expect(box.y + 400).toBeLessThan(PHONE.height)
    const x = box.x + box.width / 2
    const y = box.y + box.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    for (let i = 1; i <= 10; i++) await page.mouse.move(x, y + i * 40)
    await page.mouse.up()
    await expect(sheet).toHaveCount(0)
  })

  test.describe('with reduced motion', () => {
    test.use({ reducedMotion: 'reduce' })

    test('owner adds an area from a sheet and sees the toast', async ({ page }) => {
      const name = `Sheet-lia ${stamp}`
      await loginAs(page, 'owner')
      await page.goto('/admin/areas')
      await page.getByRole('button', { name: 'Nytt område' }).click()
      const sheet = page.getByRole('dialog', { name: 'Nytt område' })
      await sheet.getByLabel('Navn').fill(name)
      await sheet.getByRole('button', { name: 'Lagre' }).click()
      await expect(sheet).toHaveCount(0)
      await expect(page.getByRole('status').filter({ hasText: 'Lagret ✓' })).toBeVisible()
      await expect(page.getByRole('row', { name: new RegExp(name) })).toBeVisible()
    })

    test('picker registers a batch from the sheet', async ({ page }) => {
      await loginAs(page, 'picker')
      await page.goto('/admin/batches')
      await page.getByRole('button', { name: 'Ny høsting' }).click()
      const sheet = page.getByRole('dialog', { name: 'Ny høsting' })
      await sheet.getByLabel('Område').selectOption({ label: 'Bekken' })
      await sheet.getByLabel('Plukkere').fill('Kari')
      await sheet.getByLabel('Bruttovekt (kg)').fill('1,1')
      await sheet.getByRole('button', { name: 'Lagre' }).click()
      await page.waitForURL(/\/batches\/[0-9a-f-]{36}$/)
      await expect(page.getByText('1,1 kg').first()).toBeVisible()
    })
  })
})
