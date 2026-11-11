import { createHash, randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { todayOslo } from '../../src/lib/domain/time'
import { adminClient, authUserId, loginAs } from './helpers'

// A tiny JPEG kept inline so this task does not add fixtures for the later forms task.
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdAAr/2Q==',
  'base64',
)
const key = `receipts/${todayOslo().slice(0, 4)}/${randomUUID()}.jpg`
let entryId: string
let receiptId: string
let sellerId: string
let ownerId: string
let objectStored = false

test.describe.serial('protected ledger receipts', () => {
  test.beforeAll(async () => {
    const admin = adminClient() // Refuses nonlocal Supabase URLs before any setup.
    sellerId = await authUserId('seller')
    ownerId = await authUserId('owner')
    const { data: category, error: categoryError } = await admin.from('ledger_categories')
      .select('id').eq('kind', 'expense').eq('name', 'Emballasje').single()
    if (categoryError) throw categoryError
    const { data: entry, error: entryError } = await admin.from('ledger_entries').insert({
      kind: 'expense', entry_date: todayOslo(), category_id: category.id,
      amount_ore: 12345, description: `E2E receipt ${randomUUID()}`, payment_method: 'card', created_by: sellerId,
    }).select('id').single()
    if (entryError) throw entryError
    entryId = entry.id
    const { error: storageError } = await admin.storage.from('receipts').upload(key, JPEG, { contentType: 'image/jpeg' })
    if (storageError) throw storageError
    objectStored = true
    const { data: receipt, error: receiptError } = await admin.from('ledger_receipts').insert({
      entry_id: entryId, storage_key: key, file_name: 'receipt.jpg', mime_type: 'image/jpeg',
      size_bytes: JPEG.length, sha256: createHash('sha256').update(JPEG).digest('hex'), uploaded_by: sellerId,
    }).select('id').single()
    if (receiptError) throw receiptError
    receiptId = receipt.id
  })

  test.afterAll(async () => {
    // Only test-created storage bytes are removed. Ledger rows cannot be deleted and stay in place.
    if (objectStored) {
      const { error } = await adminClient().storage.from('receipts').remove([key])
      if (error) throw error
    }
  })

  test('seller reads own receipt with private streaming headers', async ({ page }) => {
    await loginAs(page, 'seller')
    const response = await page.request.get(`/api/receipts/${receiptId}`)
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toBe('image/jpeg')
    expect(response.headers()['content-disposition']).toContain('inline; filename="receipt.jpg"')
    expect(response.headers()['cache-control']).toBe('private, no-store')
    expect(response.headers()['x-content-type-options']).toBe('nosniff')
    expect(await response.body()).toEqual(JPEG)
    expect((await page.request.get('/api/receipts/not-a-uuid')).status()).toBe(404)
    expect((await page.request.get(`/api/receipts/${randomUUID()}`)).status()).toBe(404)
  })

  test('picker cannot read receipts', async ({ page }) => {
    await loginAs(page, 'picker')
    expect((await page.request.get(`/api/receipts/${receiptId}`)).status()).toBe(404)
  })

  test('owner can read a seller receipt', async ({ page }) => {
    await loginAs(page, 'owner')
    const response = await page.request.get(`/api/receipts/${receiptId}`)
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toBe('image/jpeg')
  })

  test('signed-out visitors cannot read receipts', async ({ request }) => {
    expect((await request.get(`/api/receipts/${receiptId}`, { maxRedirects: 0 })).status()).toBe(404)
  })

  test('seller cannot read another person’s receipt', async ({ page }) => {
    const admin = adminClient()
    const { error } = await admin.from('ledger_entries').update({ created_by: ownerId }).eq('id', entryId)
    if (error) throw error
    try {
      await loginAs(page, 'seller')
      expect((await page.request.get(`/api/receipts/${receiptId}`)).status()).toBe(404)
    } finally {
      const { error: restoreError } = await admin.from('ledger_entries').update({ created_by: sellerId }).eq('id', entryId)
      if (restoreError) throw restoreError
    }
  })

  test('seller loses access after 30 days; owner retains access', async ({ page }) => {
    const { error } = await adminClient().from('ledger_entries')
      .update({ created_at: new Date(Date.now() - 31 * 86400000).toISOString() }).eq('id', entryId)
    if (error) throw error
    await loginAs(page, 'seller')
    expect((await page.request.get(`/api/receipts/${receiptId}`)).status()).toBe(404)
    await loginAs(page, 'owner')
    expect((await page.request.get(`/api/receipts/${receiptId}`)).status()).toBe(200)
  })
})
