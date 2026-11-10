import ExcelJS from 'exceljs'
import { COMPANY, SITE_NAME } from '@/content/site'
import { oreToKrNumber } from '@/lib/domain/money'
import { PAYMENT_LABEL, summarize, type ExportEntry } from '@/lib/domain/ledger'
import type { Period } from '@/lib/domain/periods'

const MONEY = '#,##0.00'

function sheet(wb: ExcelJS.Workbook, name: string, title: string, columns: { header: string; key: string; width: number; money?: boolean }[]) {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 2 }] })
  ws.getRow(1).getCell(1).value = title
  ws.getRow(1).font = { bold: true }
  const header = ws.getRow(2)
  columns.forEach((c, i) => {
    header.getCell(i + 1).value = c.header
    ws.getColumn(i + 1).width = c.width
    if (c.money) ws.getColumn(i + 1).numFmt = MONEY
  })
  header.font = { bold: true }
  return ws
}

/** Builds the export workbook: Poster, Per kategori, Per måned. Sums are values, not formulas. */
export async function buildWorkbook(entries: ExportEntry[], period: Period): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook()
  wb.creator = SITE_NAME
  const title = `${SITE_NAME} – ${COMPANY.legalName} (org.nr ${COMPANY.orgNr}) – ${period.from} til ${period.to}`
  const { totals, byCategory, byMonth } = summarize(entries)

  const poster = sheet(wb, 'Poster', title, [
    { header: 'Nummer', key: 'number', width: 14 },
    { header: 'Dato', key: 'date', width: 12 },
    { header: 'Type', key: 'kind', width: 10 },
    { header: 'Konto', key: 'account', width: 8 },
    { header: 'Kategori', key: 'category', width: 24 },
    { header: 'Motpart', key: 'counterparty', width: 22 },
    { header: 'Beskrivelse', key: 'description', width: 36 },
    { header: 'Betaling', key: 'payment', width: 16 },
    { header: 'Beløp (kr)', key: 'amount', width: 14, money: true },
    { header: 'Kvitteringer', key: 'receipts', width: 40 },
    { header: 'Annullert', key: 'voided', width: 10 },
    { header: 'Grunn', key: 'reason', width: 24 },
  ])
  for (const e of entries) {
    poster.addRow([
      e.number,
      e.entryDate,
      e.kind === 'income' ? 'Inntekt' : 'Utgift',
      e.accountNo,
      e.category,
      e.counterparty ?? '',
      e.description,
      PAYMENT_LABEL[e.paymentMethod],
      oreToKrNumber(e.amountOre),
      e.receiptNames.join(', '),
      e.voided ? 'Ja' : '',
      e.voidReason ?? '',
    ])
  }

  const perCategory = sheet(wb, 'Per kategori', title, [
    { header: 'Konto', key: 'account', width: 8 },
    { header: 'Kategori', key: 'category', width: 28 },
    { header: 'Inntekt (kr)', key: 'income', width: 14, money: true },
    { header: 'Kostnad (kr)', key: 'expense', width: 14, money: true },
  ])
  for (const c of byCategory) {
    perCategory.addRow([c.accountNo, c.category, oreToKrNumber(c.incomeOre), oreToKrNumber(c.expenseOre)])
  }
  const catSum = perCategory.addRow(['', 'Sum', oreToKrNumber(totals.incomeOre), oreToKrNumber(totals.expenseOre)])
  catSum.font = { bold: true }
  const result = perCategory.addRow(['', 'Resultat', oreToKrNumber(totals.profitOre), null])
  result.font = { bold: true }

  const perMonth = sheet(wb, 'Per måned', title, [
    { header: 'Måned', key: 'month', width: 10 },
    { header: 'Inntekt (kr)', key: 'income', width: 14, money: true },
    { header: 'Kostnad (kr)', key: 'expense', width: 14, money: true },
    { header: 'Resultat (kr)', key: 'profit', width: 14, money: true },
  ])
  for (const m of byMonth) {
    perMonth.addRow([m.month, oreToKrNumber(m.incomeOre), oreToKrNumber(m.expenseOre), oreToKrNumber(m.profitOre)])
  }
  const monthSum = perMonth.addRow(['Sum', oreToKrNumber(totals.incomeOre), oreToKrNumber(totals.expenseOre), oreToKrNumber(totals.profitOre)])
  monthSum.font = { bold: true }

  const buf = await wb.xlsx.writeBuffer()
  return new Uint8Array(buf as ArrayBuffer)
}
