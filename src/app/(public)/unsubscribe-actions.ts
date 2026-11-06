'use server'

import { createAdminClient } from '@/lib/supabase/admin'

export type UnsubscribeState = { status: 'done' | 'invalid' | 'error'; language?: 'no' | 'en' }

const TOKEN_RE = /^[0-9a-f]{64}$/

export async function unsubscribeAction(_prev: UnsubscribeState | null, form: FormData): Promise<UnsubscribeState> {
  const token = form.get('token')
  if (typeof token !== 'string' || !TOKEN_RE.test(token)) return { status: 'invalid' }
  try {
    const db = createAdminClient()
    const { data, error } = await db
      .from('season_signups')
      .select('id, language, unsubscribed_at')
      .eq('unsubscribe_token', token)
      .maybeSingle()
    if (error) throw error
    if (!data) return { status: 'invalid' }
    const language = data.language === 'en' ? 'en' : 'no'
    if (!data.unsubscribed_at) {
      const { error: updateError } = await db
        .from('season_signups')
        .update({ unsubscribed_at: new Date().toISOString() })
        .eq('id', data.id)
      if (updateError) throw updateError
    }
    return { status: 'done', language }
  } catch (e) {
    console.error('Unsubscribe failed', e)
    return { status: 'error' }
  }
}
