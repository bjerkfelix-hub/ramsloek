import 'server-only'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { nextWeekMonday, splitAtOsloMidnight, type ShiftKind } from '@/lib/domain/planning'
import { osloLocalToIso } from '@/lib/domain/time'

export type VisibleRate = { profile_id: string; hourly_rate_ore: number }
export type WorkShift = { id: string; profile_id: string; starts_at: string; ends_at: string; kind: ShiftKind; note: string | null; cancelled_at: string | null; cancel_reason: string | null }
export type SchedulePerson = { id: string; full_name: string; active: boolean }
export type ShiftWeek = { monday: string; shifts: WorkShift[]; plannedMs: number }
export type MyShiftWeeks = { weeks: ShiftWeek[] }
export type ShiftAudit = { id: number; at: string; actor: string | null; actorName: string; data: { old?: Partial<WorkShift>; new?: Partial<WorkShift> } }
export type WeekScheduleData = { monday: string; people: SchedulePerson[]; shifts: WorkShift[]; plannedMs: number; history: Record<string, ShiftAudit[]>; copyCount: number }
const FIELDS = 'id, profile_id, starts_at, ends_at, kind, note, cancelled_at, cancel_reason'
export function plannedMilliseconds(shifts: WorkShift[], monday: string): number {
  const end = nextWeekMonday(monday)
  return shifts.filter(s => !s.cancelled_at).flatMap(s => splitAtOsloMidnight(s.starts_at, s.ends_at)).filter(s => s.date >= monday && s.date < end).reduce((sum,s) => sum + s.durationMs, 0)
}
async function shiftsInWeek(monday: string, profileId?: string): Promise<WorkShift[]> {
  const next = nextWeekMonday(monday)
  const client = await createClient()
  let query = client.from('work_shifts').select(FIELDS).lt('starts_at', osloLocalToIso(`${next}T00:00`)!).gt('ends_at', osloLocalToIso(`${monday}T00:00`)!).order('starts_at').order('id')
  if (profileId) query = query.eq('profile_id', profileId)
  const { data, error } = await query
  if (error) throw Error('Kunne ikke hente vaktene. Prøv igjen.')
  return (data ?? []) as WorkShift[]
}
export async function getMyShifts(monday: string): Promise<MyShiftWeeks> {
  const me = await requireRole('owner', 'picker', 'seller')
  const weeks = await Promise.all([monday, nextWeekMonday(monday)].map(async date => {
    const shifts = await shiftsInWeek(date, me.id)
    return { monday: date, shifts, plannedMs: plannedMilliseconds(shifts, date) }
  }))
  return { weeks }
}
export async function getCurrentRates(): Promise<VisibleRate[]> {
  await requireRole('owner', 'picker', 'seller')
  const client = await createClient()
  const { data, error } = await client.from('work_rates').select('profile_id, hourly_rate_ore')
  if (error) throw Error('Kunne ikke hente timesatsene. Prøv igjen.')
  return data ?? []
}
export async function getWeekSchedule(monday: string): Promise<WeekScheduleData> {
  await requireRole('owner')
  const client = await createClient()
  const [shifts, profiles] = await Promise.all([shiftsInWeek(monday), client.from('profiles').select('id, full_name, active').order('full_name').order('id')])
  if (profiles.error) throw Error('Kunne ikke hente personene. Prøv igjen.')
  const allPeople = (profiles.data ?? []) as SchedulePerson[]
  const people = allPeople.filter(p => p.active || shifts.some(s => s.profile_id === p.id))
  const history: Record<string, ShiftAudit[]> = {}
  if (shifts.length) {
    const audit = await client.from('audit_log').select('id, at, actor, data').eq('table_name', 'work_shifts').in('row_id', shifts.map(s => s.id)).order('id')
    if (audit.error) throw Error('Kunne ikke hente historikken. Prøv igjen.')
    for (const row of audit.data ?? []) {
      const entry = row as Omit<ShiftAudit, 'actorName'>
      const id = entry.data.new?.id ?? entry.data.old?.id
      if (id) (history[id] ??= []).push({ ...entry, actorName: allPeople.find(p => p.id === entry.actor)?.full_name ?? 'Ukjent' })
    }
  }
  const end = nextWeekMonday(monday)
  return { monday, people, shifts, plannedMs: plannedMilliseconds(shifts, monday), history,
    copyCount: shifts.filter(s => !s.cancelled_at && Date.parse(s.starts_at) >= Date.parse(osloLocalToIso(`${monday}T00:00`)!) && Date.parse(s.starts_at) < Date.parse(osloLocalToIso(`${end}T00:00`)!)).length }
}

export type ClockEntry = {
  id: string; version: number; started_at: string; ended_at: string | null
  shift_id: string | null; hourly_rate_ore: number | null; start_key: string
}
export type TimeAudit = {
  id: number; at: string; actorName: string
  data: { old?: Partial<TimeEntryDetail>; new?: Partial<TimeEntryDetail> }
}
export type TimeEntryDetail = ClockEntry & {
  profile_id: string; personName: string; correction_reason: string | null
  corrected_at: string | null; corrected_by: string | null; history: TimeAudit[]
}
const CLOCK_FIELDS = 'id, version, started_at, ended_at, shift_id, hourly_rate_ore, start_key'
export async function getMyOpenEntry(): Promise<ClockEntry | null> {
  const me = await requireRole('owner', 'picker', 'seller')
  const client = await createClient()
  const { data, error } = await client.from('time_entries').select(CLOCK_FIELDS).eq('profile_id', me.id).is('ended_at', null).maybeSingle()
  if (error) throw Error('Kunne ikke hente stemplingen. Prøv igjen.')
  return data as ClockEntry | null
}
export async function getTimeEntry(id: string): Promise<TimeEntryDetail | null> {
  const me = await requireRole('owner', 'picker', 'seller')
  if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) return null
  const client = await createClient()
  const { data, error } = await client.from('time_entries').select(`${CLOCK_FIELDS}, profile_id, correction_reason, corrected_at, corrected_by`).eq('id', id).maybeSingle()
  if (error) throw Error('Kunne ikke hente timeregistreringen. Prøv igjen.')
  if (!data) return null
  let personName = me.fullName
  const history: TimeAudit[] = []
  if (me.role === 'owner') {
    const [people, audit] = await Promise.all([
      client.from('profiles').select('id, full_name'),
      client.from('audit_log').select('id, at, actor, data').eq('table_name', 'time_entries').eq('row_id', id).order('id'),
    ])
    if (people.error || audit.error) throw Error('Kunne ikke hente historikken. Prøv igjen.')
    const name = (id: string) => people.data?.find(p => p.id === id)?.full_name ?? 'Ukjent'
    personName = name(data.profile_id)
    for (const row of audit.data ?? []) history.push({ id: row.id, at: row.at, actorName: name(row.actor), data: row.data })
  }
  return { ...data, personName, history } as TimeEntryDetail
}
export async function getForgottenEntries(): Promise<{ id: string; personName: string; started_at: string }[]> {
  await requireRole('owner')
  const client = await createClient()
  const [entries, people] = await Promise.all([
    client.from('time_entries').select('id, profile_id, started_at').is('ended_at', null).lt('started_at', new Date(Date.now() - 14 * 3600000).toISOString()).order('started_at'),
    client.from('profiles').select('id, full_name'),
  ])
  if (entries.error || people.error) throw Error('Kunne ikke hente åpne registreringer. Prøv igjen.')
  return (entries.data ?? []).map(e => ({ id: e.id, started_at: e.started_at, personName: people.data?.find(p => p.id === e.profile_id)?.full_name ?? 'Ukjent' }))
}
