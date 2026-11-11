import Link from 'next/link'
import { requireRole } from '@/lib/auth'
import { Page, LargeTitle } from '@/features/admin/ui/Page'
import { loadHoursExport } from '@/features/planlegging/export-data'
import { hoursMoney } from '@/features/planlegging/HoursOverview'
import { parseMonth } from '@/lib/domain/planning'
import { todayOslo, formatDateTime } from '@/lib/domain/time'
export default async function HoursExportPage({ searchParams }: { searchParams: Promise<{ month?: string | string[] }> }) {
  await requireRole('owner')
  const params = await searchParams
  const selected = params.month === undefined ? todayOslo().slice(0,7) : typeof params.month === 'string' ? params.month : ''
  const invalid = !parseMonth(selected)
  const month = invalid ? todayOslo().slice(0,7) : selected
  const data = await loadHoursExport(month)
  const incomplete = data.missingRateCount > 0 || data.openEntries.length > 0
  return <Page><LargeTitle>Eksport av timer</LargeTitle>
    <Link className="a-link" href="/admin/timer">Tilbake til Timer</Link>
    <form className="a-card a-section flex flex-wrap items-end gap-3" action="/admin/timer/eksport"><label className="a-field min-w-0">Måned<input className="a-input" type="month" name="month" defaultValue={month} required /></label><button className="a-btn a-btn-primary">Vis</button></form>
    {invalid && <p role="alert">Velg en gyldig måned.</p>}
    <section className="a-card a-section space-y-3"><h2 className="a-h2">{incomplete ? 'Ufullstendig grunnlag' : 'Lønnsgrunnlag'}</h2><p>Lønnsgrunnlag – ikke lønnskjøring</p>
      <p>{incomplete ? 'Foreløpig beløp' : 'Beløp'}: <strong data-testid="export-amount">{hoursMoney(data.knownAmountOre)}</strong></p>
      <p>Mangler timesats: {data.missingRateCount} dagsrader. Åpne registreringer: {data.openEntries.length}.</p>
      <p>Åpne registreringer er ikke med i summer. Manglende timesatser gir tomme beløp i Excel.</p>
      {data.missingRateCount > 0 && <Link className="a-link" href="/admin/users">Timesatser på Brukere</Link>}
      {data.openEntries.map(e => <p key={e.id} className="break-words"><Link className="a-link" href={`/admin/timer/${e.id}`}>{e.personName} · {formatDateTime(e.started_at)}</Link>{e.forgotten && <strong className="block">Glemt å stemple ut?</strong>}</p>)}
      <Link className="a-btn a-btn-primary" href={`/api/planlegging/export.xlsx?month=${month}`} prefetch={false}>Last ned Excel</Link>
    </section>
  </Page>
}
