'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { text, type ActionResult } from '@/lib/action-result'
import { strictOsloLocalToIso } from '@/lib/domain/planning'
import { dbErrorToMessage } from '@/lib/errors'

const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
const wall = (value: string) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value)).replace(' ', 'T')
const failure = (message: string): ActionResult => ({ ok: false, error: dbErrorToMessage({ message }) })

export async function correctTime(form: FormData): Promise<ActionResult> {
  await requireRole('owner')
  const id = text(form, 'id'), reason = text(form, 'reason'), rawVersion = text(form, 'expected_version')
  if (!UUID.test(id)) return failure('PLANNING_NOT_FOUND')
  if (reason.length < 3 || reason.length > 500) return failure('TIME_REASON')
  const version = Number(rawVersion)
  if (!/^[1-9]\d*$/.test(rawVersion) || !Number.isSafeInteger(version)) return failure('PLANNING_STALE')
  const client = await createClient()
  const { data: row, error } = await client.from('time_entries').select('started_at, ended_at, version').eq('id', id).maybeSingle()
  if (error) return { ok: false, error: dbErrorToMessage(error) }
  if (!row) return failure('PLANNING_NOT_FOUND')
  if (Number(row.version) !== version) return failure('PLANNING_STALE')
  // A hidden original is only evidence of an unchanged field when it equals the
  // current DB instant. Never accept a client-provided offset/instant as authority.
  function instant(field: 'start' | 'end', current: string | null): string | null {
    const input = text(form, field), original = text(form, `original_${field}`)
    if (!input && field === 'end') return null
    if (current && original === current && input === wall(current)) return current
    return strictOsloLocalToIso(input)
  }
  const start = instant('start', row.started_at), end = instant('end', row.ended_at)
  if (!start || (text(form, 'end') && !end)) return failure('PLANNING_LOCAL_TIME')
  if (end && Date.parse(end) < Date.parse(start)) return failure('TIME_INTERVAL')
  const result = await client.rpc('correct_time_entry', {
    p_id: id, p_started_at: start, p_ended_at: end, p_reason: reason,
    p_expected_version: version, p_fill_missing_rate: ['on','true'].includes(text(form, 'fill_missing_rate')),
  })
  if (result.error) return { ok: false, error: dbErrorToMessage(result.error) }
  revalidatePath(`/admin/timer/${id}`)
  revalidatePath('/admin/timer')
  revalidatePath('/admin/stemple')
  revalidatePath('/admin')
  return { ok: true }
}
