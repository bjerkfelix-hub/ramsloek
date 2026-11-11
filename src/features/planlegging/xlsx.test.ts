import { expect, it, vi } from 'vitest'
import ExcelJS from 'exceljs'
vi.mock('server-only', () => ({}))
import { buildHoursWorkbook } from './xlsx'
import type { HoursExportData } from './export-data'
const line = (id: string, name: string, rate: number | null, amount: number | null) => ({ profileId: id, personName: name, date: '2026-03-31', sourceId: id, sourceKind: 'time' as const, durationMs: 60000, rateOre: rate, amountOre: amount })
it('writes exact numeric segments, literal names, missing and zero rates, and control warnings', async () => {
 const rows = [line('b', '=Literal', 10000, 167), line('a', '=Literal', 10000, 167), line('c', '+Zero', 0, 0), line('d', '@Missing', null, null), line('e', '-Name', 25000, 12500)]
 rows[4].durationMs = 1800000
 const data: HoursExportData = { month: '2026-03', rows, knownAmountOre: 12834, missingRateCount: 1, openEntries: [{ id: 'open', profileId: 'b', personName: '=Literal', started_at: '2026-01-01T00:00:00Z', forgotten: true }] }
 const book = new ExcelJS.Workbook(); await book.xlsx.load(Buffer.from(await buildHoursWorkbook(data)) as unknown as ArrayBuffer)
 const sheet = book.getWorksheet('Timer')!
 expect(sheet.getRow(1).values).toEqual([undefined, 'Person','Dato','Timer','Timesats (kr)','Beløp (kr)','Merknad'])
 expect(sheet.rowCount).toBe(6); expect(sheet.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 }); expect(sheet.getRow(1).font.bold).toBe(true)
 let total = 0
 sheet.eachRow((row, n) => { if (n === 1) return; expect(row.getCell(1).type).toBe(ExcelJS.ValueType.String); expect(row.getCell(3).type).toBe(ExcelJS.ValueType.Number); expect(row.getCell(5).numFmt).toBe('#,##0.00'); if (typeof row.getCell(5).value === 'number') total += Math.round(row.getCell(5).value as number * 100); if (row.getCell(1).value === '@Missing') { expect(row.getCell(4).value).toBeNull(); expect(row.getCell(5).value).toBeNull(); expect(row.getCell(6).value).toBe('Mangler timesats') } })
 expect(total).toBe(12834)
 const control = JSON.stringify(book.getWorksheet('Kontroll')!.getSheetValues())
 expect(control).toContain('Ufullstendig grunnlag'); expect(control).toContain('2026-01-01'); expect(control).toContain('128.34')
})
it('empty month has only Timer headers', async () => {
 const book = new ExcelJS.Workbook(); await book.xlsx.load(Buffer.from(await buildHoursWorkbook({ month: '2026-04', rows: [], knownAmountOre: 0, missingRateCount: 0, openEntries: [] })) as unknown as ArrayBuffer)
 expect(book.getWorksheet('Timer')!.rowCount).toBe(1)
})
