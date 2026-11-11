import 'server-only'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { isForgotten, summarizePlanning, nextWeekMonday, splitAtOsloMidnight, type PlanningSegment, type ShiftKind } from '@/lib/domain/planning'
import { fetchAll } from '@/features/regnskap/fetch-all'
import { parsePeriod } from '@/lib/domain/periods'
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

export type HoursSummary = ReturnType<typeof summarizePlanning>
export type HoursOpenEntry = { id: string; profileId: string; personName: string; started_at: string; forgotten: boolean }
export type HoursData = {
  period: { from: string; to: string }; segments: PlanningSegment[]; summary: HoursSummary
  people: (SchedulePerson & { summary: HoursSummary })[]; openEntries: HoursOpenEntry[]
  rates: VisibleRate[]; entries: { id: string; started_at: string; ended_at: string; shift_id: string | null }[]
}

// PostgREST may encode bigint as strings. Never round an unsafe JSON number or truncate a fraction.
function reportInteger(value: unknown): number {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+$/.test(value))) throw Error('Ugyldig tall i timerapporten.')
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < 0) throw Error('Ugyldig tall i timerapporten.')
  return number
}
type DailyRow = { profile_id: string; work_date: string; source_kind: string; source_id: string; duration_ms: unknown; hourly_rate_ore: unknown; amount_ore: unknown }
export async function getHours(period: { from: string; to: string }): Promise<HoursData> {
  const me = await requireRole('owner', 'picker', 'seller')
  if (!parsePeriod(period.from, period.to) || Date.parse(period.to) - Date.parse(period.from) > 365 * 86400000) throw Error('Velg en gyldig periode.')
  const client = await createClient()
  const [daily, open, rates, profiles, entries] = await Promise.all([
    fetchAll<DailyRow>((from, to) => client.rpc('planning_daily', { p_from: period.from, p_to: period.to }).order('profile_id').order('work_date').order('source_kind').order('source_id').range(from, to)),
    fetchAll<{ id: string; profile_id: string; started_at: string }>((from, to) => {
      let query = client.from('time_entries').select('id, profile_id, started_at').is('ended_at', null).order('id')
      if (me.role !== 'owner') query = query.eq('profile_id', me.id)
      return query.range(from, to)
    }),
    fetchAll<VisibleRate>((from, to) => client.from('work_rates').select('profile_id, hourly_rate_ore').order('profile_id').range(from, to)),
    me.role === 'owner' ? fetchAll<SchedulePerson>((from, to) => client.from('profiles').select('id, full_name, active').order('id').range(from, to)) : Promise.resolve([{ id: me.id, full_name: me.fullName, active: true }]),
    fetchAll<HoursData['entries'][number]>((from, to) => client.from('time_entries').select('id, started_at, ended_at, shift_id').not('ended_at', 'is', null).lt('started_at', osloLocalToIso(`${dayAfter(period.to)}T00:00`)!).gte('ended_at', osloLocalToIso(`${period.from}T00:00`)!).order('id').range(from, to)),
  ])
  const segments: PlanningSegment[] = daily.map(row => {
    if (row.source_kind !== 'shift' && row.source_kind !== 'time') throw Error('Ugyldig rad i timerapporten.')
    const rateOre = row.hourly_rate_ore === null ? null : reportInteger(row.hourly_rate_ore)
    if (rateOre !== null && rateOre > 1000000) throw Error('Ugyldig timesats.')
    return { profileId: row.profile_id, date: row.work_date, sourceKind: row.source_kind, sourceId: row.source_id, durationMs: reportInteger(row.duration_ms), rateOre, amountOre: row.amount_ore === null ? null : reportInteger(row.amount_ore) }
  })
  const people = profiles.filter(p => p.active || segments.some(s => s.profileId === p.id) || open.some(e => e.profile_id === p.id)).map(p => ({ ...p, summary: summarizePlanning(segments.filter(s => s.profileId === p.id)) })).sort((a,b) => a.full_name.localeCompare(b.full_name, 'nb') || a.id.localeCompare(b.id))
  const now = Date.now()
  return { period, segments, summary: summarizePlanning(segments), people, rates, entries,
    openEntries: open.map(e => ({ id: e.id, profileId: e.profile_id, personName: profiles.find(p => p.id === e.profile_id)?.full_name ?? 'Ukjent', started_at: e.started_at, forgotten: isForgotten(e.started_at, null, now) })) }
}
function dayAfter(date: string): string {
  const day = new Date(`${date}T00:00:00Z`); day.setUTCDate(day.getUTCDate() + 1); return day.toISOString().slice(0,10)
}

export type WorkTask = {
  id: string; title: string; description: string | null; assigned_to: string | null
  due_date: string | null; important: boolean; status: import('@/lib/domain/planning').TaskStatus
  completed_at: string | null; completed_by: string | null; archived_at: string | null
  created_at: string; assigneeName: string | null; completedByName: string | null
}
const TASK_FIELDS = 'id, title, description, assigned_to, due_date, important, status, completed_at, completed_by, archived_at, created_at'
async function loadTasks(profileId: string | null, includeArchived: boolean): Promise<WorkTask[]> {
  const client = await createClient()
  const tasks = await fetchAll<Omit<WorkTask, 'assigneeName' | 'completedByName'>>((from, to) => {
    let query = client.from('work_tasks').select(TASK_FIELDS).order('important', { ascending: false }).order('due_date', { ascending: true, nullsFirst: false }).order('created_at').order('id')
    if (!includeArchived) query = query.is('archived_at', null)
    if (profileId) query = query.eq('assigned_to', profileId)
    return query.range(from, to)
  })
  // Resolve names only for visible tasks; workers never download the owner's board or audit.
  const ids = [...new Set(tasks.flatMap(t => [t.assigned_to, t.completed_by]).filter((id): id is string => !!id))]
  const names = new Map<string, string>()
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await client.from('profiles').select('id, full_name').in('id', ids.slice(i, i + 100))
    if (error) throw Error('Kunne ikke hente personene. Prøv igjen.')
    for (const person of data ?? []) names.set(person.id, person.full_name)
  }
  return tasks.map(t => ({ ...t, assigneeName: t.assigned_to ? names.get(t.assigned_to) ?? 'Ukjent' : null, completedByName: t.completed_by ? names.get(t.completed_by) ?? 'Ukjent' : null }))
}
export async function getMyTasks(): Promise<WorkTask[]> {
  const me = await requireRole('owner','picker','seller')
  return loadTasks(me.id, false)
}
export async function getTaskBoard(includeArchived: boolean): Promise<WorkTask[]> {
  await requireRole('owner')
  return loadTasks(null, includeArchived)
}
