import { expect, test, type Page } from '@playwright/test'

// Uses the local Supabase mail catcher (Mailpit) to read the real login e-mail.
const MAILPIT = 'http://127.0.0.1:54324/api/v1'
const EMAIL = 'eier@test.local'

type MailSummary = { ID: string; To: { Address: string }[]; Created: string }

async function clearMail() {
  await fetch(`${MAILPIT}/messages`, { method: 'DELETE' })
}

/** Waits for the newest login e-mail to `to` and returns its code and link. */
async function latestLoginMail(to: string): Promise<{ code: string; link: string; subject: string }> {
  for (let i = 0; i < 40; i++) {
    const list = (await (await fetch(`${MAILPIT}/messages`)).json()) as { messages: MailSummary[] }
    const msg = list.messages.find((m) => m.To.some((t) => t.Address === to))
    if (msg) {
      const full = (await (await fetch(`${MAILPIT}/message/${msg.ID}`)).json()) as { HTML: string; Subject: string }
      const code = /letter-spacing: 6px[^>]*>(\d{6,10})</.exec(full.HTML)?.[1]
      const href = /href="([^"]*\/admin\/login\/lenke[^"]*)"/.exec(full.HTML)?.[1]
      if (!code || !href) throw new Error('Login e-mail has no code or link')
      return { code, link: href.replace(/&amp;/g, '&'), subject: full.Subject }
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`No login e-mail for ${to}`)
}

/** Asks for a code. Supabase allows one login e-mail per user per minute, so wait and retry like a person would. */
async function requestCode(page: Page) {
  await page.goto('/admin/login')
  await page.getByLabel('E-post').fill(EMAIL)
  const sent = page.getByRole('status').filter({ hasText: `Vi har sendt en kode til ${EMAIL}` })
  for (let attempt = 0; attempt < 15; attempt++) {
    await page.getByRole('button', { name: 'Send innloggingskode' }).click()
    const outcome = await Promise.race([
      sent.waitFor().then(() => 'sent' as const),
      page.getByRole('alert').filter({ hasText: 'For mange forsøk' }).waitFor().then(() => 'limited' as const),
    ])
    if (outcome === 'sent') return
    await page.waitForTimeout(5000)
  }
  throw new Error('Login e-mail was rate limited for too long')
}

test.describe.serial('login with code or scanner-safe link', () => {
  test.setTimeout(150_000)
  test.beforeEach(clearMail)

  test('the e-mail has a code; typing it signs in', async ({ page }) => {
    await requestCode(page)
    const mail = await latestLoginMail(EMAIL)
    expect(mail.subject).toBe('Logg inn på Ramsløk')
    expect(mail.code).toMatch(/^\d{6}$/)

    await page.getByLabel('Kode fra e-posten').fill('000000')
    await page.getByRole('button', { name: 'Logg inn' }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'Koden er feil eller utløpt' })).toBeVisible()

    // Spaces as typed from a phone are fine.
    await page.getByLabel('Kode fra e-posten').fill(`${mail.code.slice(0, 3)} ${mail.code.slice(3)}`)
    await page.getByRole('button', { name: 'Logg inn' }).click()
    await page.waitForURL((u) => u.pathname === '/admin')
    await expect(page.getByRole('heading', { name: 'Oversikt', level: 1 })).toBeVisible()
  })

  test('a scanner fetching the link does not use it up; another browser can sign in', async ({ page, browser, request }) => {
    await requestCode(page)
    const { link } = await latestLoginMail(EMAIL)

    // What Microsoft Safe Links does: fetch the URL before the reader.
    const scanned = await request.get(link)
    expect(scanned.status()).toBe(200)

    // Open it in a completely separate browser context (no cookies from the one that asked).
    const other = await browser.newContext()
    const tab = await other.newPage()
    await tab.goto(link)
    await tab.getByRole('button', { name: 'Logg inn' }).click()
    await tab.waitForURL((u) => u.pathname === '/admin')
    await expect(tab.getByRole('heading', { name: 'Oversikt', level: 1 })).toBeVisible()

    // The link is single-use once actually used.
    const again = await other.newPage()
    await other.clearCookies()
    await again.goto(link)
    await again.getByRole('button', { name: 'Logg inn' }).click()
    await expect(again.getByRole('alert').filter({ hasText: 'Lenken er ugyldig eller utløpt' })).toBeVisible()
    await other.close()
  })

  test('a malformed link explains itself', async ({ page }) => {
    await page.goto('/admin/login/lenke?token_hash=&type=email')
    await expect(page.getByRole('alert').filter({ hasText: 'Lenken er ugyldig eller utløpt' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Til innlogging' })).toBeVisible()
  })
})
