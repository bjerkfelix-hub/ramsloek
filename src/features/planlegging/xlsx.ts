import 'server-only'
import ExcelJS from 'exceljs'
import type { HoursExportData } from './export-data'

export async function buildHoursWorkbook(data: HoursExportData): Promise<Uint8Array> {
  const book = new ExcelJS.Workbook()
  const sheet = book.addWorksheet('Timer', { views: [{ state: 'frozen', ySplit: 1 }] })
  sheet.columns = [{ header: 'Person', width: 35 }, { header: 'Dato', width: 14 }, { header: 'Timer', width: 14 }, { header: 'Timesats (kr)', width: 19 }, { header: 'Beløp (kr)', width: 19 }, { header: 'Merknad', width: 28 }]
  sheet.getRow(1).font = { bold: true }
  const rows = [...data.rows].sort((a,b) => a.personName.localeCompare(b.personName, 'nb') || a.date.localeCompare(b.date) || a.sourceId.localeCompare(b.sourceId))
  for (const line of rows) {
    const row = sheet.addRow([line.personName, line.date, line.durationMs / 3600000, line.rateOre === null ? null : line.rateOre / 100, line.amountOre === null ? null : line.amountOre / 100, line.rateOre === null ? 'Mangler timesats' : line.durationMs === 0 ? 'Nullvarig korrigering' : ''])
    for (const column of [3,4,5]) row.getCell(column).numFmt = '#,##0.00'
  }
  const control = book.addWorksheet('Kontroll')
  control.columns = [{ width: 42 }, { width: 45 }]
  control.addRow(['Måned', data.month])
  control.addRow(['Lønnsgrunnlag – ikke lønnskjøring'])
  const incomplete = data.missingRateCount > 0 || data.openEntries.length > 0
  control.addRow([incomplete ? 'Ufullstendig grunnlag' : 'Fullstendig grunnlag'])
  control.addRow([incomplete ? 'Foreløpig beløp' : 'Beløp', data.knownAmountOre / 100]).getCell(2).numFmt = '#,##0.00'
  control.addRow(['Rader med manglende timesats', data.missingRateCount])
  control.addRow(['Åpne registreringer', data.openEntries.length])
  control.addRow(['Person', 'Start (tidspunkt med tidssone)']).font = { bold: true }
  for (const entry of [...data.openEntries].sort((a,b) => a.personName.localeCompare(b.personName,'nb') || a.started_at.localeCompare(b.started_at) || a.id.localeCompare(b.id))) control.addRow([entry.personName, entry.started_at])
  return new Uint8Array(await book.xlsx.writeBuffer())
}
