import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getReceipt } from '@/lib/storage/receipts'

export const runtime = 'nodejs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const missing = () => new Response('Fant ikke kvitteringen.', {
  status: 404, headers: { 'Cache-Control': 'private, no-store' },
})

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user || !['owner', 'seller'].includes(user.role)) return missing()
  const { id } = await ctx.params
  if (!UUID.test(id)) return missing()

  const supabase = await createClient()
  const { data: receipt, error } = await supabase.from('ledger_receipts')
    .select('storage_key, file_name, mime_type').eq('id', id).maybeSingle()
  if (error || !receipt) return missing()
  // Fetch privileged bytes only after the session query has authorized the row through RLS.
  const stored = await getReceipt(receipt.storage_key)
  if (!stored) return missing()
  const filename = receipt.file_name.replace(/[\x00-\x1f\x7f"\\/]/g, '').trim() || 'kvittering'
  const fallback = filename.replace(/[^\x20-\x7e]/g, '_')
  const encoded = encodeURIComponent(filename).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16)}`)
  return new Response(stored.body, {
    headers: {
      // Type comes from the sniffed value recorded at upload, never from the storage backend.
      'Content-Type': receipt.mime_type,
      'Content-Disposition': `inline; filename="${fallback}"; filename*=UTF-8''${encoded}`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      // Defence in depth for images: never run script or load anything as a page. Not for PDFs:
      // browsers' built-in PDF viewers refuse to render sandboxed documents, and the bytes were
      // verified to be a real PDF (magic bytes) at upload.
      ...(receipt.mime_type === 'application/pdf'
        ? {}
        : { 'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox" }),
    },
  })
}
