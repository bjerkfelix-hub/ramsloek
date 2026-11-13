import { expect, test } from '@playwright/test'

test('public responses send security headers without exposing the framework', async ({ request }) => {
  const response = await request.get('/')
  expect(response.status()).toBe(200)
  const headers = response.headers()
  expect(headers['strict-transport-security']).toBe('max-age=31536000')
  expect(headers['x-content-type-options']).toBe('nosniff')
  expect(headers['x-frame-options']).toBe('SAMEORIGIN')
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
  expect(headers).not.toHaveProperty('x-powered-by')
})
