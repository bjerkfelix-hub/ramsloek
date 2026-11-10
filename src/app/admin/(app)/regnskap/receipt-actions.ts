'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { putReceipt, removeOrphanReceipt } from '@/lib/storage/receipts'
import { text, type ActionResult } from '@/lib/action-result'
import { MIME_EXT, sniffMime } from '@/lib/domain/file-sniff'
import { todayOslo } from '@/lib/domain/time'
import { dbErrorToMessage } from '@/lib/errors'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function uploadReceipt(form: FormData): Promise<ActionResult & { receiptId?: string }> {
  const user = await requireRole('owner', 'seller')
  const parent = text(form, 'parent')
  const parentId = text(form, 'parent_id')
  if (!['entry', 'takings'].includes(parent) || !UUID.test(parentId)) {
    return { ok: false, error: 'Ugyldig post.' }
  }
  const file = form.get('file')
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'Velg en fil.' }
  if (file.size > 10_485_760) return { ok: false, error: 'Filen er for stor (maks 10 MB).' }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const mime = sniffMime(bytes)
  if (!mime) return { ok: false, error: 'Filtypen støttes ikke. Bruk bilde eller PDF.' }

  const supabase = await createClient()
  const { data: record, error: parentError } = await supabase
    .from(parent === 'entry' ? 'ledger_entries' : 'market_takings')
    .select('id, created_by, voided_at').eq('id', parentId).maybeSingle()
  if (parentError) return { ok: false, error: dbErrorToMessage(parentError) }
  if (!record || (user.role === 'seller' && (record.created_by !== user.id || record.voided_at))) {
    return { ok: false, error: dbErrorToMessage({ message: 'RECEIPT_PARENT_INVALID' }) }
  }

  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const sha256 = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
  const key = `receipts/${todayOslo().slice(0, 4)}/${crypto.randomUUID()}.${MIME_EXT[mime]}`
  // Preserve the original name while removing path, control and header delimiters.
  const fileName = file.name.replace(/[\x00-\x1f\x7f/\\:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120) || `kvittering.${MIME_EXT[mime]}`
  try {
    await putReceipt(key, bytes, mime)
  } catch {
    return { ok: false, error: 'Kunne ikke laste opp kvitteringen. Prøv igjen.' }
  }

  // After the bytes are stored, remove them only when the database definitely rejected the row.
  // A lost response (network error, timeout) may hide a committed row, and a committed row can never
  // be changed or deleted, so in that case look it up first; if unsure, keep the (harmless) object.
  const resolveUncertain = async (): Promise<ActionResult & { receiptId?: string }> => {
    const { data: existing, error: lookupError } = await supabase
      .from('ledger_receipts').select('id').eq('storage_key', key).maybeSingle()
    if (!lookupError && existing) {
      revalidatePath('/admin/regnskap', 'layout')
      return { ok: true, receiptId: existing.id }
    }
    if (!lookupError) await removeOrphanReceipt(key)
    return { ok: false, error: 'Kunne ikke lagre kvitteringen. Prøv igjen.' }
  }

  try {
    const { data, error } = await supabase.from('ledger_receipts').insert({
      entry_id: parent === 'entry' ? parentId : null,
      takings_id: parent === 'takings' ? parentId : null,
      storage_key: key,
      file_name: fileName,
      mime_type: mime,
      size_bytes: bytes.length,
      sha256,
      uploaded_by: user.id,
    }).select('id').single()
    if (error || !data) {
      // PostgREST rejections carry a SQLSTATE or PGRST code; transport failures do not.
      if (error && typeof error.code === 'string' && error.code !== '') {
        await removeOrphanReceipt(key)
        return { ok: false, error: dbErrorToMessage(error) }
      }
      return resolveUncertain()
    }
    revalidatePath('/admin/regnskap', 'layout')
    return { ok: true, receiptId: data.id }
  } catch {
    return resolveUncertain()
  }
}
