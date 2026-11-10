import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ReceiptMime } from '@/lib/domain/file-sniff'

export async function putReceipt(key: string, bytes: Uint8Array, mime: ReceiptMime): Promise<void> {
  const { error } = await createAdminClient().storage.from('receipts').upload(key, bytes, {
    contentType: mime,
    upsert: false,
  })
  if (error) throw error
}

export async function getReceipt(key: string): Promise<{ body: ReadableStream<Uint8Array>; mime: string } | null> {
  const { data, error } = await createAdminClient().storage.from('receipts').download(key)
  if (error || !data) return null
  return { body: data.stream(), mime: data.type }
}

// Only for a stored object whose metadata insert failed. Posted receipts are never removed.
export async function removeOrphanReceipt(key: string): Promise<void> {
  try {
    await createAdminClient().storage.from('receipts').remove([key])
  } catch {
    // Best effort: do not mask the original upload error.
  }
}
