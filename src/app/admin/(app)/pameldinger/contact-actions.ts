'use server'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export async function changeContact(form: FormData): Promise<void> {
  const owner = await requireRole('owner')
  const table =
    form.get('kind') === 'interest'
      ? 'consumer_interests'
      : form.get('kind') === 'wholesale'
        ? 'business_inquiries'
        : null
  const id = form.get('id')
  const operation = form.get('operation')
  if (!table || typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id)) throw Error('Ugyldig henvendelse')
  const db = await createClient()
  if (operation === 'delete') {
    const { error } = await db.from(table).delete().eq('id', id)
    if (error) throw Error('Kunne ikke slette. Prøv igjen.')
  } else if (table === 'business_inquiries' && (operation === 'answer' || operation === 'undo')) {
    const { error } = await db
      .from(table)
      .update({
        answered_at: operation === 'answer' ? new Date().toISOString() : null,
        answered_by: operation === 'answer' ? owner.id : null,
      })
      .eq('id', id)
    if (error) throw Error('Kunne ikke lagre. Prøv igjen.')
  } else throw Error('Ugyldig handling')
  revalidatePath('/admin/pameldinger', 'layout')
}
