import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { putReceipt, removeOrphanReceipt } from '@/lib/storage/receipts'
import { uploadReceipt } from './receipt-actions'

vi.mock('@/lib/auth', () => ({ requireRole: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/storage/receipts', () => ({ putReceipt: vi.fn(), removeOrphanReceipt: vi.fn() }))

const USER = '11111111-1111-4111-8111-111111111111'
const PARENT = '22222222-2222-4222-8222-222222222222'
const RECEIPT = '33333333-3333-4333-8333-333333333333'
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0])
const parentResult = vi.fn()
const insertResult = vi.fn()
const insert = vi.fn()
const from = vi.fn()

function form(file = new File([JPEG], 'report.png', { type: 'text/html' })) {
  const data = new FormData()
  data.set('parent', 'entry')
  data.set('parent_id', PARENT)
  data.set('file', file)
  return data
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(requireRole).mockResolvedValue({ id: USER, fullName: 'Selger', role: 'seller' })
  parentResult.mockResolvedValue({ data: { id: PARENT, created_by: USER, voided_at: null }, error: null })
  insertResult.mockResolvedValue({ data: { id: RECEIPT }, error: null })
  insert.mockReturnValue({ select: () => ({ single: insertResult }) })
  from.mockImplementation(() => ({
    select: () => ({ eq: () => ({ maybeSingle: parentResult }) }),
    insert,
  }))
  vi.mocked(createClient).mockResolvedValue({ from } as unknown as Awaited<ReturnType<typeof createClient>>)
})

describe('uploadReceipt', () => {
  it('rejects pickers before accessing storage', async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error('NEXT_NOT_FOUND'))
    await expect(uploadReceipt(form())).rejects.toThrow('NEXT_NOT_FOUND')
    expect(requireRole).toHaveBeenCalledWith('owner', 'seller')
    expect(putReceipt).not.toHaveBeenCalled()
  })

  it('rejects an invalid parent UUID', async () => {
    const data = form()
    data.set('parent_id', 'invalid')
    expect((await uploadReceipt(data)).ok).toBe(false)
    expect(from).not.toHaveBeenCalled()
    expect(putReceipt).not.toHaveBeenCalled()
  })

  it('rejects invalid parent types and missing files', async () => {
    const data = form()
    data.set('parent', 'profiles')
    expect((await uploadReceipt(data)).ok).toBe(false)
    data.set('parent', 'entry')
    data.delete('file')
    expect((await uploadReceipt(data)).ok).toBe(false)
    expect(putReceipt).not.toHaveBeenCalled()
  })

  it('rejects files larger than 10 MB', async () => {
    const data = form(new File([new Uint8Array(10_485_761)], 'large.jpg'))
    expect(await uploadReceipt(data)).toEqual({ ok: false, error: 'Filen er for stor (maks 10 MB).' })
    expect(putReceipt).not.toHaveBeenCalled()
  })

  it('rejects HTML disguised as a JPEG', async () => {
    const data = form(new File(['<!DOCTYPE html><script>alert(1)</script>'], 'x.jpg', { type: 'image/jpeg' }))
    expect(await uploadReceipt(data)).toEqual({ ok: false, error: 'Filtypen støttes ikke. Bruk bilde eller PDF.' })
    expect(putReceipt).not.toHaveBeenCalled()
  })

  it.each([null, { id: PARENT, created_by: RECEIPT, voided_at: null }, { id: PARENT, created_by: USER, voided_at: '2026-11-01' }])(
    'rejects an inaccessible, other-owned or voided seller parent before storage: %j', async (parent) => {
      parentResult.mockResolvedValue({ data: parent, error: null })
      expect(await uploadReceipt(form())).toEqual({ ok: false, error: 'Du kan bare legge kvittering på dine egne poster.' })
      expect(putReceipt).not.toHaveBeenCalled()
    },
  )

  it('removes the same stored key and maps a database error', async () => {
    insertResult.mockResolvedValue({ data: null, error: { message: 'RECEIPT_PARENT_INVALID' } })
    expect(await uploadReceipt(form())).toEqual({ ok: false, error: 'Du kan bare legge kvittering på dine egne poster.' })
    expect(removeOrphanReceipt).toHaveBeenCalledWith(vi.mocked(putReceipt).mock.calls[0][0])
  })

  it('returns a storage failure without inserting metadata', async () => {
    vi.mocked(putReceipt).mockRejectedValue(new Error('offline'))
    expect((await uploadReceipt(form())).ok).toBe(false)
    expect(insert).not.toHaveBeenCalled()
  })

  it.each(['entry', 'takings'])('stores a sniffed JPEG, checksum and sanitized filename for %s', async (parent) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-12-31T23:30:00Z')) // Already 2027 in Oslo.
    try {
      const data = form(new File([JPEG], 'bad"\r\n/ name.png'))
      data.set('parent', parent)
      expect(await uploadReceipt(data)).toEqual({ ok: true, receiptId: RECEIPT })
      const key = vi.mocked(putReceipt).mock.calls[0][0]
      expect(key).toMatch(/^receipts\/2027\/[0-9a-f-]{36}\.jpg$/)
      expect(putReceipt).toHaveBeenCalledWith(key, JPEG, 'image/jpeg')
      expect(from).toHaveBeenCalledWith(parent === 'entry' ? 'ledger_entries' : 'market_takings')
      expect(insert).toHaveBeenCalledWith(expect.objectContaining({
        entry_id: parent === 'entry' ? PARENT : null,
        takings_id: parent === 'takings' ? PARENT : null,
        storage_key: key, mime_type: 'image/jpeg', size_bytes: JPEG.length,
        sha256: createHash('sha256').update(JPEG).digest('hex'), uploaded_by: USER,
      }))
      expect(insert.mock.calls[0][0].file_name).not.toMatch(/["\r\n/]/)
      expect(removeOrphanReceipt).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})
