'use server'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { text, type ActionResult } from '@/lib/action-result'
import { dbErrorToMessage } from '@/lib/errors'
import { parsePeriod } from '@/lib/domain/periods'
import { TASK_STATUS_LABEL, type TaskStatus } from '@/lib/domain/planning'
const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
const failure = (message: string): ActionResult => ({ ok: false, error: dbErrorToMessage({ message }) })
const refresh = () => revalidatePath('/admin/oppgaver')

export async function saveTask(form: FormData): Promise<ActionResult & { id?: string }> {
  await requireRole('owner')
  const id = text(form, 'id'), title = text(form, 'title')
  if (!UUID.test(id)) return failure('PLANNING_NOT_FOUND')
  if (!title || title.length > 200) return { ok: false, error: 'Skriv en tittel på mellom 1 og 200 tegn.' }
  const description = text(form, 'description') || null, due_date = text(form, 'due_date') || null
  if (description && description.length > 10000) return { ok: false, error: 'Beskrivelsen kan ha høyst 10 000 tegn.' }
  const people = form.getAll('assignees')
  if (people.length > 20 || people.some(person => typeof person !== 'string' || !UUID.test(person))) return failure('TASK_INVALID_ASSIGNEES')
  const assignees = [...new Set(people as string[])]
  if (due_date && !parsePeriod(due_date, due_date)) return { ok: false, error: 'Velg en gyldig dato.' }
  const payload = { title, description, due_date, important: ['on','true'].includes(text(form, 'important')) }
  const client = await createClient()
  const lookup = () => client.from('work_tasks').select('title, description, due_date, important, archived_at').eq('id', id).maybeSingle()
  const existing = await lookup()
  if (existing.error) return { ok: false, error: dbErrorToMessage(existing.error) }
  const identical = (row: NonNullable<typeof existing.data>) => Object.entries(payload).every(([key,value]) => row[key as keyof typeof payload] === value)
  if (text(form, 'intent') === 'edit') {
    if (!existing.data) return failure('PLANNING_NOT_FOUND')
    if (existing.data.archived_at) return failure('TASK_ARCHIVED')
    if (!identical(existing.data)) {
      const { data, error } = await client.from('work_tasks').update(payload).eq('id', id).select('id')
      if (error) return { ok: false, error: dbErrorToMessage(error) }
      if (!data?.length) {
        const current = await lookup()
        if (current.error) return { ok: false, error: dbErrorToMessage(current.error) }
        if (!current.data || current.data.archived_at || !identical(current.data)) return failure('PLANNING_NOT_FOUND')
      }
    }
  } else if (existing.data) {
    if (existing.data.archived_at) return failure('TASK_ARCHIVED')
    if (!identical(existing.data)) return failure('PLANNING_STALE')
  } else {
    const { error } = await client.from('work_tasks').insert({ id, ...payload })
    if (error) {
      if (error.code !== '23505') return { ok: false, error: dbErrorToMessage(error) }
      const retry = await lookup()
      if (retry.error || !retry.data || retry.data.archived_at || !identical(retry.data)) return failure('PLANNING_STALE')
    }
  }
  const assigned = await client.rpc('set_work_task_assignees', { p_task_id: id, p_people: assignees })
  if (assigned.error) return { ok: false, error: dbErrorToMessage(assigned.error) }
  refresh(); return { ok: true, id }
}
export async function setTaskStatus(id: string, status: TaskStatus): Promise<ActionResult> {
  await requireRole('owner')
  if (!UUID.test(id)) return failure('PLANNING_NOT_FOUND')
  if (!Object.hasOwn(TASK_STATUS_LABEL, status)) return { ok: false, error: 'Velg en gyldig status.' }
  const client = await createClient()
  const { data, error } = await client.from('work_tasks').update({ status }).eq('id', id).is('archived_at', null).select('id')
  if (error) return { ok: false, error: dbErrorToMessage(error) }
  if (!data?.length) {
    const current = await client.from('work_tasks').select('status, archived_at').eq('id', id).maybeSingle()
    if (current.error) return { ok: false, error: dbErrorToMessage(current.error) }
    if (!current.data || current.data.archived_at || current.data.status !== status) return failure('PLANNING_NOT_FOUND')
  }
  refresh(); return { ok: true }
}
export async function completeTask(id: string): Promise<ActionResult> {
  const me = await requireRole('owner','picker','seller')
  if (!UUID.test(id)) return failure('PLANNING_NOT_FOUND')
  const client = await createClient()
  const membership = await client.from('work_task_assignees').select('task_id').eq('task_id', id).eq('profile_id', me.id).maybeSingle()
  if (membership.error) return { ok: false, error: dbErrorToMessage(membership.error) }
  if (!membership.data) return failure('PLANNING_NOT_FOUND')
  const { data, error } = await client.from('work_tasks').update({ status: 'done' }).eq('id', id).is('archived_at', null).select('id')
  if (error) return { ok: false, error: dbErrorToMessage(error) }
  if (!data?.length) {
    const current = await client.from('work_tasks').select('status, archived_at').eq('id', id).maybeSingle()
    if (current.error) return { ok: false, error: dbErrorToMessage(current.error) }
    if (!current.data || current.data.archived_at || current.data.status !== 'done') return failure('PLANNING_NOT_FOUND')
  }
  refresh(); return { ok: true }
}
export async function archiveTask(id: string): Promise<ActionResult> {
  await requireRole('owner')
  if (!UUID.test(id)) return failure('PLANNING_NOT_FOUND')
  const client = await createClient()
  const { error } = await client.rpc('archive_work_task', { p_id: id })
  if (error) return { ok: false, error: dbErrorToMessage(error) }
  refresh(); return { ok: true }
}

export async function restoreTask(id: string): Promise<ActionResult> {
  await requireRole('owner')
  if (!UUID.test(id)) return failure('PLANNING_NOT_FOUND')
  const client = await createClient()
  const { error } = await client.rpc('restore_work_task', { p_id: id })
  if (error) return { ok: false, error: dbErrorToMessage(error) }
  refresh(); return { ok: true }
}
