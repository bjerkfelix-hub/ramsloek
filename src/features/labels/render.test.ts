import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { barcodeSpec, labelLines, renderLabelPdf, type LabelData } from './render'

const base: LabelData = {
  productName: 'Ramsløk 100 g pose',
  netWeightG: 100,
  unitKind: 'consumer',
  gtin14: '07038010055690',
  lot: 'RL-27-014',
  bestBefore: '2027-05-20',
  storageText: 'Oppbevares kjølig',
  companyName: 'Nesodden Ramsløk AS',
  companyAddress: 'Nesodden',
}

describe('labelLines', () => {
  it('lists the mandatory label text', () => {
    expect(labelLines(base)).toEqual([
      'Ramsløk 100 g pose',
      'Netto 100 g',
      'Parti: RL-27-014',
      'Best før: 20.05.2027',
      'Opprinnelse: Norge',
      'Oppbevares kjølig',
      'Nesodden Ramsløk AS, Nesodden',
    ])
  })

  it('omits missing company parts without a dangling comma', () => {
    expect(labelLines({ ...base, companyAddress: '' }).at(-1)).toBe('Nesodden Ramsløk AS')
    expect(labelLines({ ...base, companyName: '' }).at(-1)).toBe('Nesodden')
    expect(labelLines({ ...base, companyName: '', companyAddress: '' }).at(-1)).toBe('Oppbevares kjølig')
  })
})

describe('barcodeSpec', () => {
  it('uses EAN-13 for consumer units', () => {
    expect(barcodeSpec(base)).toEqual({ bcid: 'ean13', text: '7038010055690' })
  })
  it('uses GS1-128 for trade units', () => {
    expect(barcodeSpec({ ...base, unitKind: 'trade', gtin14: '17038010055703' })).toEqual({
      bcid: 'gs1-128',
      text: '(01)17038010055703(15)270520(10)RL-27-014',
    })
  })
  it('is null without a GTIN', () => {
    expect(barcodeSpec({ ...base, gtin14: null })).toBeNull()
  })
})

describe('renderLabelPdf', () => {
  it('renders one 100x50 mm page per copy', async () => {
    const pdf = await PDFDocument.load(await renderLabelPdf(base, 3))
    expect(pdf.getPageCount()).toBe(3)
    expect(Math.round(pdf.getPage(0).getWidth())).toBe(283)
    expect(Math.round(pdf.getPage(0).getHeight())).toBe(142)
  })
  it('works without a GTIN', async () => {
    await expect(renderLabelPdf({ ...base, gtin14: null }, 1)).resolves.toBeInstanceOf(Uint8Array)
  })
  it('renders trade units and unencodable characters', async () => {
    const out = await renderLabelPdf({ ...base, unitKind: 'trade', gtin14: '17038010055703', productName: 'Ramsløk 日本' }, 1)
    expect((await PDFDocument.load(out)).getPageCount()).toBe(1)
  })
})
