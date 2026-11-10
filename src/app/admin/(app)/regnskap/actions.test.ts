import { beforeEach, describe, expect, it, vi } from 'vitest'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { saveExpense, saveIncome, saveTakings } from './actions'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requireRole: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

const KEY = '11111111-1111-4111-8111-111111111111'
const CATEGORY = '22222222-2222-4222-8222-222222222222'
const DAY = '33333333-3333-4333-8333-333333333333'

const insertSingle = vi.fn()
const lookup = vi.fn()
const insert = vi.fn()

function expenseForm(over: Record<string, string> = {}) {
  const f = new FormData()
  const base = {
    client_key: KEY,
    entry_date: '2027-04-20',
    amount: '250,50',
    category_id: CATEGORY,
    counterparty: 'Bunnpris',
    description: 'Poser',
    payment_method: 'card',
    ...over,
  }
  for (const [k, v] of Object.entries(base)) f.set(k, v)
  return f
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(requireRole).mockResolvedValue({ id: 'u', fullName: 'Selger', role: 'seller' })
  insertSingle.mockResolvedValue({ data: { id: 'e1', number: 'R-2027-001' }, error: null })
  lookup.mockResolvedValue({ data: { id: 'e1', number: 'R-2027-001' }, error: null })
  insert.mockReturnValue({ select: () => ({ single: insertSingle }) })
  const from = vi.fn(() => ({
    insert,
    select: () => ({
      eq: () => ({
        maybeSingle: lookup,
        is: () => ({ maybeSingle: lookup }),
        order: () => Promise.resolve({ data: [{ number: 'R-2027-001' }] }),
      }),
    }),
  }))
  vi.mocked(createClient).mockResolvedValue({ from } as unknown as Awaited<ReturnType<typeof createClient>>)
})

describe('saveExpense', () => {
  it('saves øre and returns the entry number', async () => {
    const res = await saveExpense(expenseForm())
    expect(res).toEqual({ ok: true, entryId: 'e1', number: 'R-2027-001' })
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ kind: 'expense', amount_ore: 25050, client_key: KEY, due_date: null }))
  })

  it('rejects an amount that is not kroner', async () => {
    expect(await saveExpense(expenseForm({ amount: '12,345' }))).toEqual({
      ok: false,
      error: 'Skriv beløpet i kroner, for eksempel 1250,50.',
    })
    expect(insert).not.toHaveBeenCalled()
  })

  it('requires a description', async () => {
    expect(await saveExpense(expenseForm({ description: '  ' }))).toEqual({ ok: false, error: 'Skriv hva utgiften gjelder.' })
  })

  it('requires a due date for unpaid bills', async () => {
    expect(await saveExpense(expenseForm({ payment_method: 'unpaid' }))).toEqual({ ok: false, error: 'Velg forfallsdato.' })
    await saveExpense(expenseForm({ payment_method: 'unpaid', due_date: '2027-05-01' }))
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ due_date: '2027-05-01' }))
  })

  it('rejects impossible dates and unknown payment methods', async () => {
    expect((await saveExpense(expenseForm({ entry_date: '2027-02-30' }))).ok).toBe(false)
    expect((await saveExpense(expenseForm({ payment_method: 'gift' }))).ok).toBe(false)
  })

  it('returns the first entry when the same client key is saved twice', async () => {
    insertSingle.mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate key' } })
    expect(await saveExpense(expenseForm())).toEqual({ ok: true, entryId: 'e1', number: 'R-2027-001' })
  })
})

describe('saveIncome', () => {
  it('is owner only', async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error('NEXT_HTTP_ERROR_FALLBACK;404'))
    await expect(saveIncome(expenseForm({ payment_method: 'bank' }))).rejects.toThrow()
    expect(requireRole).toHaveBeenCalledWith('owner')
  })

  it('refuses private and unpaid for income', async () => {
    vi.mocked(requireRole).mockResolvedValue({ id: 'o', fullName: 'Eier', role: 'owner' })
    expect((await saveIncome(expenseForm({ payment_method: 'private' }))).ok).toBe(false)
    expect((await saveIncome(expenseForm({ payment_method: 'unpaid', due_date: '2027-05-01' }))).ok).toBe(false)
  })
})

describe('saveTakings', () => {
  function takings(over: Record<string, string> = {}) {
    const f = new FormData()
    for (const [k, v] of Object.entries({ market_day_id: DAY, vipps: '4350', card: '2100,50', cash: '', ...over })) f.set(k, v)
    return f
  }

  it('saves øre per method with empty as 0', async () => {
    insertSingle.mockResolvedValue({ data: { id: 't1' }, error: null })
    const res = await saveTakings(takings())
    expect(res).toMatchObject({ ok: true, takingsId: 't1', numbers: ['R-2027-001'] })
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ vipps_ore: 435000, card_ore: 210050, cash_ore: 0 }))
  })

  it('needs at least one amount', async () => {
    expect(await saveTakings(takings({ vipps: '', card: '' }))).toEqual({ ok: false, error: 'Fyll inn minst ett beløp.' })
  })

  it('explains a second takings for the same day', async () => {
    insertSingle.mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate key' } })
    expect(await saveTakings(takings())).toEqual({
      ok: false,
      error: 'Dagsoppgjør for denne markedsdagen er allerede registrert.',
    })
  })

  it('treats a retry of the same takings after a lost response as saved', async () => {
    insertSingle.mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate key' } })
    lookup.mockResolvedValue({ data: { id: 't1', vipps_ore: 435000, card_ore: 210050, cash_ore: 0 }, error: null })
    expect(await saveTakings(takings())).toMatchObject({ ok: true, takingsId: 't1', numbers: ['R-2027-001'] })
  })

  it('accepts a typed zero in a field', async () => {
    insertSingle.mockResolvedValue({ data: { id: 't1' }, error: null })
    expect((await saveTakings(takings({ cash: '0' }))).ok).toBe(true)
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ cash_ore: 0 }))
  })
})
