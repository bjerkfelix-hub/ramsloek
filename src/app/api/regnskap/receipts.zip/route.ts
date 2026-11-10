import { Zip, ZipPassThrough } from 'fflate'
import { getReceipt } from '@/lib/storage/receipts'
import { loadExport } from '@/features/regnskap/export-data'
import { downloadHeaders, exportGate } from '@/features/regnskap/export-route'

export const runtime = 'nodejs'

/**
 * Streams every receipt of the period's entries (voided ones too) as a zip, one object at a time.
 * Receipts are already compressed images/PDFs, so entries are stored (ZipPassThrough), not deflated.
 */
export async function GET(request: Request) {
  const gate = await exportGate(request)
  if (gate instanceof Response) return gate
  const { period } = gate
  const { files } = await loadExport(period)

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const zip = new Zip((err, chunk, final) => {
        if (err) {
          controller.error(err)
          return
        }
        controller.enqueue(chunk)
        if (final) controller.close()
      })
      try {
        for (const f of files) {
          const stored = await getReceipt(f.key)
          if (!stored) continue
          const entry = new ZipPassThrough(f.name)
          zip.add(entry)
          // Read one chunk ahead so the last chunk can be pushed with final = true.
          const reader = stored.body.getReader()
          let current = await reader.read()
          if (current.done) {
            entry.push(new Uint8Array(0), true) // empty object: still close the entry
            continue
          }
          for (;;) {
            const next = await reader.read()
            entry.push(current.value!, next.done)
            if (next.done) break
            current = next
          }
        }
        zip.end()
      } catch (e) {
        controller.error(e)
      }
    },
  })

  return new Response(body, {
    headers: downloadHeaders(`ramslok-kvitteringer-${period.from}-${period.to}.zip`, 'application/zip'),
  })
}
