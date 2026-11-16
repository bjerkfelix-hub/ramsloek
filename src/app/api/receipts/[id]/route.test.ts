import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ user: vi.fn(), client: vi.fn(), stored: vi.fn(), row: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getCurrentUser: mocks.user }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.client }))
vi.mock('@/lib/storage/receipts', () => ({ getReceipt: mocks.stored }))
import { GET } from './route'

const id = '11111111-1111-4111-8111-111111111111'
beforeEach(() => {
  vi.clearAllMocks()
  mocks.user.mockResolvedValue({ role: 'owner' })
  mocks.client.mockResolvedValue({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.row }) }) }) })
  mocks.stored.mockResolvedValue({ body: new Uint8Array([1, 2, 3]) })
})
it.each([
  ['application/pdf', 'attachment'],
  ['image/jpeg', 'inline'],
])('serves %s as %s with safe filenames and private headers', async (mime, disposition) => {
  mocks.row.mockResolvedValue({ data: { storage_key: 'receipts/key', file_name: 'blå"/\\\r\nkvittering', mime_type: mime }, error: null })
  const response = await GET(new Request('http://localhost'), { params: Promise.resolve({ id }) })
  expect(response.status).toBe(200)
  expect(response.headers.get('Content-Disposition')).toBe(`${disposition}; filename="bl_kvittering"; filename*=UTF-8''bl%C3%A5kvittering`)
  expect(response.headers.get('Content-Type')).toBe(mime)
  expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
  if (mime.startsWith('image/')) {
    expect(response.headers.get('Content-Security-Policy')).toBe("default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox")
  } else {
    expect(response.headers.get('Content-Security-Policy')).toBeNull()
  }
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
})
