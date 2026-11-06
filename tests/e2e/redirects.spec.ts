import { expect, test } from '@playwright/test'

const MOVED = ['/batches', '/batches/new', '/stock', '/products', '/areas', '/users', '/settings', '/login']

for (const path of MOVED) {
  test(`${path} permanently redirects to /admin${path}`, async ({ request }) => {
    const res = await request.get(path, { maxRedirects: 0 })
    expect(res.status()).toBe(308)
    expect(res.headers()['location']).toBe(`/admin${path}`)
  })
}

test('redirect preserves the query string', async ({ request }) => {
  const res = await request.get('/login?error=callback', { maxRedirects: 0 })
  expect(res.headers()['location']).toBe('/admin/login?error=callback')
})

test('signed-out root is public', async ({ request }) => {
  const res = await request.get('/', { maxRedirects: 0 })
  expect(res.status()).toBe(200)
})

test('signed-out /admin/batches ends at /admin/login', async ({ page }) => {
  await page.goto('/admin/batches')
  await expect(page).toHaveURL(/\/admin\/login$/)
})

for (const [from, to] of [
  ['/oppskrifter/ramslokssuppe', '/oppskrifter/ramsloksuppe'],
  ['/en/recipes/ramslokssuppe', '/en/recipes/ramsloksuppe'],
]) {
  test(`${from} permanently redirects to the corrected recipe slug`, async ({ request }) => {
    const res = await request.get(from, { maxRedirects: 0 })
    expect(res.status()).toBe(308)
    expect(res.headers()['location']).toBe(to)
  })
}
