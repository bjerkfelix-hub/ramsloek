import { Zip, ZipPassThrough } from 'fflate'
import { getReceipt } from '@/lib/storage/receipts'
import { loadExport, type ExportFile } from '@/features/regnskap/export-data'
import { downloadHeaders, exportGate } from '@/features/regnskap/export-route'

export const runtime = 'nodejs'

/**
 * Yields zip bytes for the given receipts, one stored object at a time. Receipts are already
 * compressed images/PDFs, so entries are stored (ZipPassThrough), not deflated. A receipt that cannot
 * be fetched is skipped and listed in MANGLER.txt so gaps remain visible to the owner.
 */
async function* zipChunks(files: ExportFile[]): AsyncGenerator<Uint8Array> {
  const missing: string[] = []
  const out: Uint8Array[] = []
  let failure: Error | null = null
  const zip = new Zip((err, chunk) => {
    if (err) failure = err
    else out.push(chunk)
  })
  const drain = function* () {
    if (failure) throw failure
    while (out.length) yield out.shift()!
  }

  for (const f of files) {
    const stored = await getReceipt(f.key).catch(() => null)
    if (!stored) {
      missing.push(f.name)
      continue
    }
    const entry = new ZipPassThrough(f.name)
    zip.add(entry)
    yield* drain()
    // Read one chunk ahead so the last chunk can be pushed with final = true.
    const reader = stored.body.getReader()
    let current = await reader.read()
    if (current.done) {
      entry.push(new Uint8Array(0), true) // empty object: still close the entry
    } else {
      for (;;) {
        const next = await reader.read()
        entry.push(current.value!, next.done)
        yield* drain()
        if (next.done) break
        current = next
      }
    }
    yield* drain()
  }
  if (missing.length) {
    const entry = new ZipPassThrough('MANGLER.txt')
    zip.add(entry)
    entry.push(new TextEncoder().encode(`Kunne ikke hente følgende kvitteringer:\n${missing.join('\n')}\n`), true)
    yield* drain()
  }
  zip.end()
  yield* drain()
}

export async function GET(request: Request) {
  const gate = await exportGate(request)
  if (gate instanceof Response) return gate
  const { period } = gate
  const { files } = await loadExport(period)
  const chunks = zipChunks(files)

  // Pull-driven: the next receipt is only fetched when the client has read what was sent, so a slow
  // phone download never makes the server hold the whole archive in memory.
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await chunks.next()
        if (done) controller.close()
        else controller.enqueue(value)
      } catch (e) {
        controller.error(e)
      }
    },
    async cancel() {
      await chunks.return(undefined)
    },
  })

  return new Response(body, {
    headers: downloadHeaders(`ramslok-kvitteringer-${period.from}-${period.to}.zip`, 'application/zip'),
  })
}
