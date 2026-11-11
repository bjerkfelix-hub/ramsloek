'use server'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { text, type ActionResult } from '@/lib/action-result'
import { dbErrorToMessage } from '@/lib/errors'
import { nextWeekMonday, shiftInterval, strictOsloLocalToIso, SHIFT_LABEL } from '@/lib/domain/planning'
const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
const failure = (message: string): ActionResult => ({ ok: false, error: dbErrorToMessage({ message }) })
function refresh() { revalidatePath('/admin/vaktplan'); revalidatePath('/admin/timer') }

export async function saveShift(form: FormData): Promise<ActionResult & { id?: string }> {
  await requireRole('owner')
  const id = text(form, 'id'), profile = text(form, 'profile_id')
  if (!UUID.test(id) || !UUID.test(profile)) return failure('PLANNING_NOT_FOUND')
  const kind = text(form, 'kind'), note = text(form, 'note') || null
  if (!Object.hasOwn(SHIFT_LABEL, kind)) return { ok: false, error: 'Velg en gyldig vakttype.' }
  if (note && note.length > 2000) return { ok: false, error: 'Notatet kan ha høyst 2000 tegn.' }
  const date = text(form, 'date'), start = text(form, 'start'), end = text(form, 'end')
  if (!strictOsloLocalToIso(`${date}T${start}`)) return failure('PLANNING_LOCAL_TIME')
  const nextDay = ['on', 'true'].includes(text(form, 'next_day'))
  const endDate = new Date(`${date}T12:00:00Z`)
  if (nextDay) endDate.setUTCDate(endDate.getUTCDate() + 1)
  if (!strictOsloLocalToIso(`${endDate.toISOString().slice(0, 10)}T${end}`)) return failure('PLANNING_LOCAL_TIME')
  const interval = shiftInterval(date, start, end, nextDay)
  if (!interval) return failure('SHIFT_INTERVAL')
  const payload = { profile_id: profile, starts_at: interval.startsAt, ends_at: interval.endsAt, kind, note }
  const client = await createClient()
  const lookup = () => client.from('work_shifts').select('profile_id, starts_at, ends_at, kind, note, cancelled_at').eq('id', id).maybeSingle()
  const existing = await lookup()
  if (existing.error) return { ok: false, error: dbErrorToMessage(existing.error) }
  const identical = (row: NonNullable<typeof existing.data>) => row.profile_id === profile && Date.parse(row.starts_at) === Date.parse(payload.starts_at) && Date.parse(row.ends_at) === Date.parse(payload.ends_at) && row.kind === kind && row.note === note
  if (text(form, 'intent') === 'edit') {
    if (!existing.data) return failure('PLANNING_NOT_FOUND')
    if (existing.data.cancelled_at) return failure('SHIFT_CANCELLED')
    const { data, error } = await client.from('work_shifts').update(payload).eq('id', id).select('id')
    if (error) return { ok: false, error: dbErrorToMessage(error) }
    if (!data?.length) return failure('PLANNING_NOT_FOUND')
  } else if (existing.data) {
    if (!identical(existing.data)) return { ok: false, error: 'Registreringen er endret. Last inn på nytt før du redigerer.' }
  } else {
    const { error } = await client.from('work_shifts').insert({ id, ...payload })
    if (error) {
      if (error.code === '23505') { const retry = await lookup(); if (retry.data && identical(retry.data)) { refresh(); return { ok: true, id } } }
      return { ok: false, error: dbErrorToMessage(error) }
    }
  }
  refresh(); return { ok: true, id }
}
export async function cancelShift(id: string, reason: string): Promise<ActionResult> {
  await requireRole('owner')
  if (!UUID.test(id)) return failure('PLANNING_NOT_FOUND')
  if (reason.trim().length < 3 || reason.trim().length > 500) return failure('SHIFT_CANCEL_REASON')
  const client = await createClient()
  const { error } = await client.rpc('cancel_work_shift', { p_id: id, p_reason: reason.trim() })
  if (error) return { ok: false, error: dbErrorToMessage(error) }
  refresh(); return { ok: true }
}
export async function copyWeek(monday: string): Promise<ActionResult & { copied?: number }> {
  await requireRole('owner')
  try { nextWeekMonday(monday) } catch { return failure('PLANNING_WEEK') }
  const client = await createClient()
  const { data, error } = await client.rpc('copy_work_week', { p_monday: monday })
  if (error) return { ok: false, error: `Ingen vakter ble kopiert. ${dbErrorToMessage(error)}` }
  refresh(); return { ok: true, copied: data }
}
