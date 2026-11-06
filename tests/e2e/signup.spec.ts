import { expect, test } from '@playwright/test'
import { adminClient, loginAs } from './helpers'

const SUCCESS_NO = 'Takk! Vi sier fra når sesongen starter.'
const stamp = Date.now()
let n = 0
const uniqueEmail = () => `e2e+${stamp}-${n++}@example.test`

async function signUp(page: import('@playwright/test').Page, email: string, consent = true) {
  await page.goto('/')
  await page.getByLabel('E-postadresse', { exact: true }).fill(email)
  if (consent) await page.getByLabel(/Jeg samtykker/).check()
  await page.getByRole('button', { name: 'Meld meg på' }).click()
}

async function row(email: string) {
  const { data, error } = await adminClient().from('season_signups').select('*').eq('email', email).maybeSingle()
  if (error) throw error
  return data
}

// The sign-up limiter allows 5 attempts per IP per 10 minutes, so tests use distinct fake client IPs.
test.beforeEach(async ({ page }, info) => {
  const ip = `10.${(stamp >> 8) % 250}.${info.workerIndex}.${(info.title.length * 7 + Math.floor(Math.random() * 200)) % 250}`
  await page.setExtraHTTPHeaders({ 'x-forwarded-for': ip })
})

test.afterAll(async () => {
  await adminClient().from('season_signups').delete().like('email', `e2e+${stamp}-%`)
})

test('sign up, repeat, unsubscribe via token, sign up again', async ({ page }) => {
  const email = uniqueEmail()
  await signUp(page, email)
  await expect(page.getByTestId('signup-success')).toHaveText(SUCCESS_NO)
  const first = await row(email)
  expect(first?.language).toBe('no')
  expect(first?.consent_text).toContain('Jeg samtykker')

  await signUp(page, email)
  await expect(page.getByTestId('signup-success')).toHaveText(SUCCESS_NO)

  await page.goto(`/avmelding/${first!.unsubscribe_token}`)
  await expect(page.getByText('Du er meldt av.')).toBeVisible()
  expect((await row(email))?.unsubscribed_at).not.toBeNull()
  // Idempotent
  await page.reload()
  await expect(page.getByText('Du er meldt av.')).toBeVisible()

  await signUp(page, email)
  await expect(page.getByTestId('signup-success')).toHaveText(SUCCESS_NO)
  expect((await row(email))?.unsubscribed_at).toBeNull()
})

test('English sign-up and unsubscribe page', async ({ page }) => {
  const email = uniqueEmail()
  await page.goto('/en')
  await page.getByLabel('Email address', { exact: true }).fill(email)
  await page.getByLabel(/I consent/).check()
  await page.getByRole('button', { name: 'Sign me up' }).click()
  await expect(page.getByTestId('signup-success')).toHaveText("Thanks! We'll let you know when the season starts.")
  const r = await row(email)
  expect(r?.language).toBe('en')
  await page.goto(`/avmelding/${r!.unsubscribe_token}`)
  await expect(page.getByText('You have been unsubscribed.')).toBeVisible()
})

test('invalid email and missing consent are rejected', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('E-postadresse', { exact: true }).fill('ikke-en-epost')
  await page.getByLabel(/Jeg samtykker/).check()
  // Bypass the browser's own email validation to hit the server check.
  await page.evaluate(() => document.querySelector('form')?.setAttribute('novalidate', ''))
  await page.getByRole('button', { name: 'Meld meg på' }).click()
  await expect(page.getByTestId('signup-error')).toHaveText('Skriv en gyldig e-postadresse.')

  const email = uniqueEmail()
  await signUp(page, email, false)
  await expect(page.getByTestId('signup-error')).toHaveText('Du må samtykke for å melde deg på.')
  expect(await row(email)).toBeNull()
})

test('honeypot: success is shown but nothing is stored', async ({ page }) => {
  const email = uniqueEmail()
  await page.goto('/')
  await page.getByLabel('E-postadresse', { exact: true }).fill(email)
  await page.getByLabel(/Jeg samtykker/).check()
  await page.locator('input[name="website"]').fill('http://spam.example')
  await page.getByRole('button', { name: 'Meld meg på' }).click()
  await expect(page.getByTestId('signup-success')).toHaveText(SUCCESS_NO)
  expect(await row(email)).toBeNull()
})

test('invalid unsubscribe token shows a neutral page', async ({ page }) => {
  await page.goto(`/avmelding/${'0'.repeat(64)}`)
  await expect(page.getByText('Lenken er ugyldig eller allerede brukt.')).toBeVisible()
  await page.goto('/en/unsubscribe/nonsense')
  await expect(page.getByText('The link is invalid or has already been used.')).toBeVisible()
})

test('rate limit blocks the sixth attempt from one IP', async ({ page }) => {
  await page.setExtraHTTPHeaders({ 'x-forwarded-for': `192.0.2.${stamp % 250}` })
  await page.goto('/')
  await page.evaluate(() => document.querySelector('form')?.setAttribute('novalidate', ''))
  for (let i = 0; i < 5; i++) {
    await page.getByLabel('E-postadresse', { exact: true }).fill('x')
    await page.getByRole('button', { name: 'Meld meg på' }).click()
    await expect(page.getByTestId('signup-error')).toHaveText('Skriv en gyldig e-postadresse.')
  }
  await page.getByRole('button', { name: 'Meld meg på' }).click()
  await expect(page.getByTestId('signup-error')).toHaveText('Prøv igjen litt senere.')
})

test('owner sees sign-ups and CSV export; others do not', async ({ page, request, browser }) => {
  const email = uniqueEmail()
  await signUp(page, email)
  await expect(page.getByTestId('signup-success')).toHaveText(SUCCESS_NO)

  // Signed out: no CSV.
  const anon = await request.get('/admin/pameldinger/export', { maxRedirects: 0 })
  expect(anon.status()).not.toBe(200)

  await loginAs(page, 'owner')
  await page.goto('/admin/pameldinger')
  await expect(page.getByRole('heading', { name: 'Påmeldinger' })).toBeVisible()
  await expect(page.getByText(email)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Last ned CSV' })).toBeVisible()

  const res = await page.request.get('/admin/pameldinger/export')
  expect(res.status()).toBe(200)
  expect(res.headers()['content-type']).toContain('text/csv; charset=utf-8')
  const body = await res.body()
  expect([...body.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
  const text = body.toString('utf8')
  expect(text.replace('﻿', '').split('\r\n')[0]).toBe('email,language,signed_up')
  expect(text).toContain(email)

  const ctx = await browser.newContext()
  const picker = await ctx.newPage()
  await loginAs(picker, 'picker')
  expect((await picker.goto('/admin/pameldinger'))?.status()).toBe(404)
  expect((await picker.request.get('/admin/pameldinger/export')).status()).toBe(404)
  await ctx.close()
})

test('signed-out export request is never served the CSV', async ({ request }) => {
  const res = await request.get('/admin/pameldinger/export', { maxRedirects: 0 })
  expect([302, 307, 401]).toContain(res.status())
})
