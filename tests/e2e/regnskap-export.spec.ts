import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import ExcelJS from 'exceljs'
import { unzipSync } from 'fflate'
import { loginAs } from './helpers'

const RECEIPT = path.join(__dirname, 'fixtures', 'receipt.jpg')
const stamp = Date.now()
const description = `E2E eksport ${stamp}`

test.describe.serial('regnskap export', () => {
  test('owner downloads Excel and receipts for this year', async ({ page }) => {
    await loginAs(page, 'seller')
    await page.goto('/admin/regnskap/utgift/ny')
    const form = page.getByTestId('expense-form')
    await form.getByLabel('Beløp (kr)').fill('99,90')
    await form.getByLabel('Kategori').selectOption({ label: 'Emballasje' })
    await form.getByLabel('Leverandør').fill('Bunnpris')
    await form.getByLabel('Hva gjelder det?').fill(description)
    await form.getByLabel('Ta bilde').setInputFiles(RECEIPT)
    await form.getByRole('button', { name: 'Lagre' }).click()
    const saved = (await page.getByTestId('ledger-saved').textContent()) ?? ''
    const number = /R-\d{4}-\d{3,}/.exec(saved)![0]

    await loginAs(page, 'owner')
    await page.goto('/admin/regnskap/eksport')
    await page.getByRole('link', { name: 'I år' }).click()

    const [xlsx] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Last ned Excel' }).click()])
    expect(xlsx.suggestedFilename()).toMatch(/^ramslok-regnskap-\d{4}-01-01-\d{4}-12-31\.xlsx$/)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load((await readFile((await xlsx.path())!)) as unknown as ArrayBuffer)
    const poster = wb.getWorksheet('Poster')!
    let row: ExcelJS.Row | undefined
    poster.eachRow((r) => {
      if (r.getCell(1).value === number) row = r
    })
    expect(row).toBeDefined()
    expect(row!.getCell(9).value).toBe(99.9)
    const receiptName = String(row!.getCell(10).value)
    expect(receiptName).toMatch(new RegExp(`^${number} Emballasje Bunnpris\\.jpg$`))

    const [zip] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Last ned kvitteringer' }).click()])
    expect(zip.suggestedFilename()).toMatch(/^ramslok-kvitteringer-.*\.zip$/)
    const files = unzipSync(new Uint8Array(await readFile((await zip.path())!)))
    expect(Object.keys(files)).toContain(receiptName)
    expect(files[receiptName][0]).toBe(0xff)
  })

  test('sellers get 404 and bad periods get 400', async ({ page }) => {
    await loginAs(page, 'seller')
    for (const url of ['/api/regnskap/export.xlsx?from=2027-01-01&to=2027-12-31', '/api/regnskap/receipts.zip?from=2027-01-01&to=2027-12-31', '/admin/regnskap/eksport']) {
      const res = await page.request.get(url)
      expect(res.status(), url).toBe(404)
    }
    await loginAs(page, 'owner')
    const bad = await page.request.get('/api/regnskap/export.xlsx?from=2027-13-01&to=2027-12-31')
    expect(bad.status()).toBe(400)
  })
})
