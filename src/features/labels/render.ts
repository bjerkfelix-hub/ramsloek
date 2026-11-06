import bwipjs from 'bwip-js/node'
import { PDFDocument, StandardFonts, type PDFFont } from 'pdf-lib'
import { ean13FromGtin, gs1_128Text } from '@/lib/domain/gs1'
import { formatGrams } from '@/lib/domain/weight'

export type LabelData = {
  productName: string
  netWeightG: number
  unitKind: 'consumer' | 'trade'
  gtin14: string | null
  lot: string
  bestBefore: string
  storageText: string
  companyName: string
  companyAddress: string
}

export type BarcodeSpec = { bcid: 'ean13' | 'gs1-128'; text: string }

const MM = 72 / 25.4
const PAGE_W = 100 * MM
const PAGE_H = 50 * MM

function formatBestBefore(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

export function labelLines(data: LabelData): string[] {
  const company = [data.companyName.trim(), data.companyAddress.trim()].filter(Boolean).join(', ')
  return [
    data.productName,
    `Netto ${formatGrams(data.netWeightG)}`,
    `Parti: ${data.lot}`,
    `Best før: ${formatBestBefore(data.bestBefore)}`,
    'Opprinnelse: Norge',
    data.storageText,
    ...(company ? [company] : []),
  ].filter((line) => line.trim() !== '')
}

export function barcodeSpec(data: LabelData): BarcodeSpec | null {
  if (!data.gtin14) return null
  if (data.unitKind === 'trade') {
    return { bcid: 'gs1-128', text: gs1_128Text({ gtin14: data.gtin14, bestBefore: data.bestBefore, lot: data.lot }) }
  }
  const ean = ean13FromGtin(data.gtin14)
  return ean ? { bcid: 'ean13', text: ean } : null
}

// Replaces characters WinAnsi (Helvetica) cannot encode so drawing never throws.
function safe(font: PDFFont, text: string): string {
  let out = ''
  for (const ch of text) {
    try {
      font.encodeText(ch)
      out += ch
    } catch {
      out += '?'
    }
  }
  return out
}

function wrap(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (font.widthOfTextAtSize(next, size) <= maxWidth || !current) current = next
    else {
      lines.push(current)
      current = word
    }
  }
  if (current) lines.push(current)
  return lines
}

async function barcodePng(spec: BarcodeSpec): Promise<Uint8Array> {
  const buf = await bwipjs.toBuffer({
    bcid: spec.bcid,
    text: spec.text,
    scale: 4,
    height: spec.bcid === 'ean13' ? 16 : 14,
    includetext: true,
    textxalign: 'center',
    textsize: 9,
    parsefnc: false,
  })
  return new Uint8Array(buf)
}

export async function renderLabelPdf(data: LabelData, copies: number): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const spec = barcodeSpec(data)
  const image = spec ? await pdf.embedPng(await barcodePng(spec)) : null

  const margin = 3 * MM
  const textWidth = PAGE_W / 2 - margin - 2 * MM
  const lines = labelLines(data)

  for (let i = 0; i < copies; i++) {
    const page = pdf.addPage([PAGE_W, PAGE_H])
    let y = PAGE_H - margin - 9
    lines.forEach((line, idx) => {
      const isTitle = idx === 0
      const font = isTitle ? bold : regular
      const size = isTitle ? 10 : 8
      for (const part of wrap(font, safe(font, line), size, textWidth)) {
        page.drawText(part, { x: margin, y, size, font })
        y -= size + 2.5
      }
      if (isTitle) y -= 2
    })

    if (image) {
      const maxW = PAGE_W / 2 - margin
      const maxH = PAGE_H - 2 * margin
      const scale = Math.min(maxW / image.width, maxH / image.height)
      const w = image.width * scale
      const h = image.height * scale
      page.drawImage(image, { x: PAGE_W / 2 + (PAGE_W / 2 - margin - w) / 2, y: (PAGE_H - h) / 2, width: w, height: h })
    }
  }
  return pdf.save()
}
