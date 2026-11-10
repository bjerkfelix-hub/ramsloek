import { describe, expect, it } from 'vitest'
import {
  meterLevel, MVA_LIMIT_ORE, PAYMENT_LABEL, receiptFileName, summarize, uniqueNames,
  type ExportEntry,
} from './ledger'

describe('meterLevel', () => {
  it.each([
    [0, 'ok'], [3_999_999, 'ok'], [4_000_000, 'warn'],
    [4_999_999, 'warn'], [5_000_000, 'over'], [6_000_000, 'over'],
  ])('classifies %i øre as %s', (income, level) => {
    expect(meterLevel(income)).toBe(level)
  })

  it('exports the registration limit and Norwegian payment labels', () => {
    expect(MVA_LIMIT_ORE).toBe(5_000_000)
    expect(PAYMENT_LABEL).toEqual({
      vipps: 'Vipps', card: 'Kort', cash: 'Kontant', bank: 'Bank',
      private: 'Lagt ut privat', unpaid: 'Ubetalt regning',
    })
  })
})

describe('summarize', () => {
  const income: ExportEntry = {
    number: 'R-2027-001', entryDate: '2027-02-15', kind: 'income',
    category: 'Salg marked', accountNo: '3000', counterparty: null,
    description: 'Dagsoppgjør', paymentMethod: 'vipps', amountOre: 100000,
    voided: false, voidReason: null, receiptNames: [],
  }
  const expense: ExportEntry = {
    ...income, number: 'R-2027-003', kind: 'expense', category: 'Emballasje',
    accountNo: '4300', amountOre: 25000,
  }

  it('excludes voided lines and sorts category and month totals', () => {
    const entries = [
      expense, income,
      { ...income, number: 'R-2027-002', amountOre: 500000, voided: true, voidReason: 'Feil' },
      { ...expense, number: 'R-2027-004', entryDate: '2027-01-20', amountOre: 15000 },
    ]
    expect(summarize(entries)).toEqual({
      totals: { incomeOre: 100000, expenseOre: 40000, profitOre: 60000 },
      byCategory: [
        { accountNo: '3000', category: 'Salg marked', incomeOre: 100000, expenseOre: 0 },
        { accountNo: '4300', category: 'Emballasje', incomeOre: 0, expenseOre: 40000 },
      ],
      byMonth: [
        { month: '2027-01', incomeOre: 0, expenseOre: 15000, profitOre: -15000 },
        { month: '2027-02', incomeOre: 100000, expenseOre: 25000, profitOre: 75000 },
      ],
    })
    expect(entries[0]).toEqual(expense)
  })

  it('keeps categories sharing an account separate and sorts by name', () => {
    expect(summarize([expense, { ...expense, category: 'Annet' }]).byCategory).toEqual([
      { accountNo: '4300', category: 'Annet', incomeOre: 0, expenseOre: 25000 },
      { accountNo: '4300', category: 'Emballasje', incomeOre: 0, expenseOre: 25000 },
    ])
  })

  it('returns zero totals and empty groups for empty or entirely voided input', () => {
    const empty = {
      totals: { incomeOre: 0, expenseOre: 0, profitOre: 0 }, byCategory: [], byMonth: [],
    }
    expect(summarize([])).toEqual(empty)
    expect(summarize([{ ...income, voided: true }])).toEqual(empty)
  })
})

describe('receiptFileName', () => {
  it('removes unsafe characters and collapses spaces', () => {
    expect(receiptFileName({
      number: 'R-2027-014', category: 'Emballasje', counterparty: 'Bunnpris / Nesodden', ext: 'jpg',
    })).toBe('R-2027-014 Emballasje Bunnpris Nesodden.jpg')
    expect(receiptFileName({
      number: 'R-2027-014', category: 'Emballasje', counterparty: '\\:*?"<>|\u0000\u001f\u007f  Butikk', ext: 'pdf',
    })).toBe('R-2027-014 Emballasje Butikk.pdf')
  })

  it('adds a report suffix after the number and omits a missing counterparty', () => {
    expect(receiptFileName({
      number: 'R-2027-014', category: 'Salg marked', counterparty: null, suffix: 'rapport', ext: 'jpg',
    })).toBe('R-2027-014-rapport Salg marked.jpg')
  })

  it('limits the stem to 120 characters while preserving the extension', () => {
    const name = receiptFileName({
      number: 'R-2027-014', category: 'Emballasje', counterparty: 'x'.repeat(200), ext: 'webp',
    })
    expect(name).toHaveLength(125)
    expect(name.endsWith('.webp')).toBe(true)
  })
})

describe('uniqueNames', () => {
  it('numbers duplicates before the extension', () => {
    expect(uniqueNames(['a.jpg', 'a.jpg', 'a.jpg'])).toEqual(['a.jpg', 'a-2.jpg', 'a-3.jpg'])
    expect(uniqueNames(['report.v1.pdf', 'report.v1.pdf'])).toEqual(['report.v1.pdf', 'report.v1-2.pdf'])
    expect(uniqueNames([])).toEqual([])
  })

  it('avoids collisions with names that already have a numbered suffix', () => {
    expect(uniqueNames(['a.jpg', 'a.jpg', 'a-2.jpg', 'a-2.jpg'])).toEqual([
      'a.jpg', 'a-3.jpg', 'a-2.jpg', 'a-2-2.jpg',
    ])
  })
})
