import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { renderLabelPdf, type LabelData } from '@/features/labels/render'

export const runtime = 'nodejs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_COPIES = 500

const text = (body: string, status: number) =>
  new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } })

export async function GET(request: Request, ctx: { params: Promise<{ packingId: string }> }) {
  const user = await getCurrentUser()
  if (!user) return text('Ikke innlogget.', 401)

  const { packingId } = await ctx.params
  if (!UUID.test(packingId)) return text('Fant ikke pakkingen.', 404)

  const supabase = await createClient()
  const { data: packing } = await supabase
    .from('packings')
    .select('units, best_before, products(name, net_weight_g, unit_kind, gtin, storage_text), batches(lot_number)')
    .eq('id', packingId)
    .maybeSingle()
  if (!packing) return text('Fant ikke pakkingen.', 404)

  const product = Array.isArray(packing.products) ? packing.products[0] : packing.products
  const batch = Array.isArray(packing.batches) ? packing.batches[0] : packing.batches
  if (!product || !batch) return text('Fant ikke pakkingen.', 404)

  const raw = new URL(request.url).searchParams.get('copies')
  let copies = Math.min(packing.units, MAX_COPIES)
  if (raw !== null) {
    if (!/^\d+$/.test(raw) || Number(raw) < 1) return text('Ugyldig antall etiketter.', 400)
    copies = Number(raw)
    if (copies > MAX_COPIES) return text('Maks 500 etiketter om gangen.', 400)
  }

  const { data: settings } = await supabase.from('settings').select('company_name, address').maybeSingle()

  const data: LabelData = {
    productName: product.name,
    netWeightG: product.net_weight_g,
    unitKind: product.unit_kind as LabelData['unitKind'],
    gtin14: product.gtin,
    lot: batch.lot_number,
    bestBefore: packing.best_before,
    storageText: product.storage_text ?? '',
    companyName: settings?.company_name ?? '',
    companyAddress: settings?.address ?? '',
  }
  let pdf: Uint8Array
  try {
    pdf = await renderLabelPdf(data, copies)
  } catch {
    return text('Kunne ikke lage strekkode for denne etiketten.', 500)
  }
  const filename = batch.lot_number.replace(/[^A-Za-z0-9._-]/g, '_')
  return new Response(Buffer.from(pdf), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="etiketter-${filename}.pdf"`,
      'cache-control': 'private, no-store',
    },
  })
}
