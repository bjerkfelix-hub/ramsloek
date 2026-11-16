import { beforeEach, expect, it, vi } from 'vitest'
import { unzipSync, strFromU8 } from 'fflate'
const mocks = vi.hoisted(() => ({ get: vi.fn(), load: vi.fn() }))
vi.mock('@/lib/storage/receipts', () => ({ getReceipt: mocks.get }))
vi.mock('@/features/regnskap/export-data', () => ({ loadExport: mocks.load }))
vi.mock('@/features/regnskap/export-route', () => ({
  exportGate: async () => ({ period: { from: '2026-01-01', to: '2026-12-31' } }),
  downloadHeaders: () => ({ 'Content-Type': 'application/zip' }),
}))
import { GET } from './route'
beforeEach(() => vi.clearAllMocks())
it('exports available receipts and lists every unavailable numbered filename', async () => {
  mocks.load.mockResolvedValue({ files: [
    { name: '2026-001.jpg', key: 'missing1' }, { name: '2026-002.jpg', key: 'real' },
    { name: '2026-003.pdf', key: 'missing2' },
  ] })
  mocks.get.mockImplementation(async (key: string) => key === 'real'
    ? { body: new Blob(['receipt']).stream() } : key === 'missing2' ? Promise.reject(new Error('offline')) : null)
  const response = await GET(new Request('http://localhost/api/regnskap/receipts.zip'))
  const files = unzipSync(new Uint8Array(await response.arrayBuffer()))
  expect(Object.keys(files)).toEqual(['2026-002.jpg', 'MANGLER.txt'])
  expect(strFromU8(files['2026-002.jpg'])).toBe('receipt')
  expect(strFromU8(files['MANGLER.txt'])).toContain('2026-001.jpg\n2026-003.pdf')
})
it('does not add a missing-files notice for a complete archive', async () => {
  mocks.load.mockResolvedValue({ files: [{ name: '1.jpg', key: 'real' }] })
  mocks.get.mockResolvedValue({ body: new Blob(['receipt']).stream() })
  const files = unzipSync(new Uint8Array(await (await GET(new Request('http://localhost/api'))).arrayBuffer()))
  expect(Object.keys(files)).toEqual(['1.jpg'])
})
