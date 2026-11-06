import { beforeEach, describe, expect, it, vi } from 'vitest'

const revalidatePath = vi.fn()
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePath(p) }))

import { revalidateMarketPages } from './revalidate'

describe('revalidateMarketPages', () => {
  beforeEach(() => revalidatePath.mockClear())
  it('revalidates the admin and public market pages', () => {
    revalidateMarketPages()
    expect(revalidatePath.mock.calls.map((c) => c[0])).toEqual(['/admin/marked', '/', '/marked', '/en', '/en/markets'])
  })
})
