import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import { buildWorkbook } from './xlsx'
import { summarize, type ExportEntry } from '@/lib/domain/ledger'

const base: Omit<ExportEntry, 'number' | 'kind' | 'amountOre' | 'voided'> = {
  entryDate: '2027-04-20',
  category: 'Emballasje',
  accountNo: '4300',
  counterparty: 'Bunnpris',
  description: 'Poser',
  paymentMethod: 'card',
  voidReason: null,
  receiptNames: [],
}

const entries: ExportEntry[] = [
  { ...base, number: 'R-2027-001', kind: 'income', category: 'Salg marked', accountNo: '3000', amountOre: 650050, voided: false, receiptNames: ['R-2027-001-rapport Salg marked.jpg'] },
  { ...base, number: 'R-2027-002', kind: 'expense', amountOre: 25050, voided: false },
  { ...base, number: 'R-2027-003', kind: 'expense', entryDate: '2027-05-02', amountOre: 99900, voided: true, voidReason: 'Feil' },
]

async function load(bytes: Uint8Array) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(Buffer.from(bytes) as unknown as ArrayBuffer)
  return wb
}

describe('buildWorkbook', () => {
  it('lists every entry and sums only non-voided ones', async () => {
    const wb = await load(await buildWorkbook(entries, { from: '2027-01-01', to: '2027-12-31' }))
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Poster', 'Per kategori', 'Per måned'])

    const poster = wb.getWorksheet('Poster')!
    expect(poster.getCell('A1').value).toContain('DONTPANIC AS')
    expect(poster.rowCount).toBe(2 + 3)
    expect(poster.getRow(3).getCell(9).value).toBe(6500.5)
    expect(typeof poster.getRow(4).getCell(9).value).toBe('number')
    expect(poster.getRow(3).getCell(10).value).toBe('R-2027-001-rapport Salg marked.jpg')
    expect(poster.getRow(5).getCell(11).value).toBe('Ja')

    const { totals } = summarize(entries)
    const cat = wb.getWorksheet('Per kategori')!
    const sumRow = cat.getRow(cat.rowCount - 1)
    expect(sumRow.getCell(2).value).toBe('Sum')
    expect(Math.round((sumRow.getCell(3).value as number) * 100)).toBe(totals.incomeOre)
    expect(Math.round((sumRow.getCell(4).value as number) * 100)).toBe(totals.expenseOre)

    const month = wb.getWorksheet('Per måned')!
    expect(month.getRow(3).getCell(1).value).toBe('2027-04')
    expect(month.getRow(month.rowCount).getCell(4).value).toBe((650050 - 25050) / 100)
  })

  it('makes a valid file with headers only when there are no entries', async () => {
    const wb = await load(await buildWorkbook([], { from: '2027-01-01', to: '2027-01-31' }))
    expect(wb.getWorksheet('Poster')!.rowCount).toBe(2)
    expect(wb.getWorksheet('Poster')!.getCell('A2').value).toBe('Nummer')
  })
})
