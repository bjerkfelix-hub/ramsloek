import Link from 'next/link'
import { requireRole } from '@/lib/auth'
import { LargeTitle, Page } from '@/features/admin/ui/Page'
import { getHours } from '@/features/planlegging/queries'
import { HoursOverview } from '@/features/planlegging/HoursOverview'
import { parseMonth, nextWeekMonday, weekPeriod } from '@/lib/domain/planning'
import { todayOslo } from '@/lib/domain/time'

export default async function HoursPage({ searchParams }: { searchParams: Promise<{ mode?: string | string[]; month?: string | string[]; week?: string | string[]; person?: string | string[] }> }) {
  const me = await requireRole('owner', 'picker', 'seller')
  const params = await searchParams
  const today = todayOslo(), mode = params.mode === 'month' ? 'month' : 'week'
  let month = typeof params.month === 'string' ? params.month : today.slice(0,7)
  let week = typeof params.week === 'string' ? params.week : weekPeriod(today).from
  let invalid = false
  if (!parseMonth(month)) { month = today.slice(0,7); invalid = true }
  try { nextWeekMonday(week) } catch { week = weekPeriod(today).from; invalid = true }
  const period = mode === 'month' ? parseMonth(month)! : weekPeriod(week)
  const data = await getHours(period)
  const owner = me.role === 'owner'
  const person = owner && typeof params.person === 'string' ? params.person : undefined
  const previous = new Date(`${period.from}T00:00:00Z`), next = new Date(previous)
  if (mode === 'month') { previous.setUTCMonth(previous.getUTCMonth()-1); next.setUTCMonth(next.getUTCMonth()+1) } else { previous.setUTCDate(previous.getUTCDate()-7); next.setUTCDate(next.getUTCDate()+7) }
  const href = (date: Date) => `/admin/timer?mode=${mode}&${mode === 'month' ? 'month' : 'week'}=${date.toISOString().slice(0,mode === 'month' ? 7 : 10)}${person ? `&person=${encodeURIComponent(person)}` : ''}`
  return <Page><LargeTitle>Timer</LargeTitle><div className="flex flex-wrap gap-3"><Link className="a-btn a-btn-tinted" href="/admin/stemple">Stemple</Link>{owner && <Link className="a-btn a-btn-tinted" href={`/admin/timer/eksport?month=${month}`}>Eksport</Link>}</div>
    <form className="a-card a-section flex flex-wrap items-end gap-3" action="/admin/timer">
      <label className="a-field">Periode<select className="a-input" name="mode" defaultValue={mode}><option value="week">Uke</option><option value="month">Måned</option></select></label>
      <label className="a-field min-w-0">Ukestart (mandag)<input className="a-input" type="date" name="week" defaultValue={week} /></label>
      <label className="a-field min-w-0">Måned<input className="a-input" type="month" name="month" defaultValue={month} /></label>
      {owner && <label className="a-field min-w-0 max-w-full">Person<select className="a-input max-w-full" name="person" defaultValue={person ?? ''}><option value="">Alle personer</option>{data.people.map(p => <option key={p.id} value={p.id}>{p.full_name}{!p.active && ' (inaktiv)'}</option>)}</select></label>}
      <button className="a-btn a-btn-primary" type="submit">Vis</button>
    </form>
    {invalid && <p role="alert">Velg en gyldig måned og en mandag som ukestart.</p>}
    <nav aria-label="Velg periode" className="flex flex-wrap items-center gap-3"><Link className="a-btn a-btn-tinted" href={href(previous)}>Forrige</Link><p>{period.from} – {period.to}</p><Link className="a-btn a-btn-tinted" href={href(next)}>Neste</Link></nav>
    <HoursOverview data={data} owner={owner} personId={person || undefined} ownId={me.id} />
  </Page>
}
