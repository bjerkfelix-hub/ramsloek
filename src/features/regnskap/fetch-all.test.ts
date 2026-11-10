import { describe, expect, it, vi } from 'vitest'
import { fetchAll, PAGE_SIZE } from './fetch-all'

describe('fetchAll', () => {
  it('pages until a short page and returns every row', async () => {
    const total = PAGE_SIZE * 2 + 7
    const page = vi.fn(async (from: number, to: number) => ({
      data: Array.from({ length: Math.max(0, Math.min(to, total - 1) - from + 1) }, (_, i) => from + i),
      error: null,
    }))
    const rows = await fetchAll(page)
    expect(rows).toHaveLength(total)
    expect(rows[total - 1]).toBe(total - 1)
    expect(page).toHaveBeenCalledTimes(3)
    expect(page).toHaveBeenNthCalledWith(2, PAGE_SIZE, PAGE_SIZE * 2 - 1)
  })

  it('makes one more request when the last page is exactly full', async () => {
    const page = vi.fn(async (from: number) => ({ data: from === 0 ? Array(PAGE_SIZE).fill(1) : [], error: null }))
    expect(await fetchAll(page)).toHaveLength(PAGE_SIZE)
    expect(page).toHaveBeenCalledTimes(2)
  })

  it('throws the database error', async () => {
    await expect(fetchAll(async () => ({ data: null, error: new Error('boom') }))).rejects.toThrow('boom')
  })
})
