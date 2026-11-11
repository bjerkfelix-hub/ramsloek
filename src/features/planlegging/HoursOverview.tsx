import Link from 'next/link'
import type { HoursData } from './queries'
import { summarizePlanning } from '@/lib/domain/planning'
import { formatDateTime } from '@/lib/domain/time'

const decimal = (value: number) => value.toLocaleString('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const hoursMoney = (ore: number) => `${decimal(ore / 100)} kr`
export function HoursOverview({ data, owner, personId, ownId }: { data: HoursData; owner: boolean; personId?: string; ownId: string }) {
  const segments = data.segments.filter(s => !personId || s.profileId === personId)
  const summary = summarizePlanning(segments)
  const open = data.openEntries.filter(e => !personId || e.profileId === personId)
  const ownRate = data.rates.find(r => r.profile_id === ownId)
  return <div className="space-y-5">
    <section className="a-card a-section space-y-3" aria-label="Summer">
      <p>Timesats: {ownRate ? `${hoursMoney(ownRate.hourly_rate_ore)}/time` : 'Ikke satt'}</p>
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div><dt>Planlagte timer</dt><dd>{decimal(summary.plannedMs / 3600000)}</dd></div>
        <div><dt>Arbeidede timer</dt><dd>{decimal(summary.workedMs / 3600000)}</dd></div>
        <div><dt>Planlagt beløp (anslag)</dt><dd data-testid="planned-amount">{hoursMoney(summary.plannedAmountOre)}</dd></div>
        <div><dt>{summary.missingWorkedRateCount ? 'Foreløpig beløp' : 'Beløp'}</dt><dd data-testid="worked-amount">{hoursMoney(summary.workedAmountOre)}</dd></div>
      </dl>
      {summary.missingPlannedRateCount > 0 && <p>Planlagt beløp er ufullstendig: {summary.missingPlannedRateCount} dagsrader mangler timesats.</p>}
      {summary.missingWorkedRateCount > 0 && <p role="status">Mangler timesats: {summary.missingWorkedRateCount} dagsrader. Beløpet viser bare kjente beløp. {owner && <Link className="a-link" href="/admin/users">Endre timesats på Brukere</Link>}</p>}
      <p className="a-muted">Arbeidede beløp bruker timesatsen fra innstempling. Åpne registreringer er ikke med i summer. Lønnsgrunnlag – ikke lønnskjøring.</p>
    </section>
    {owner && <section className="a-card a-section space-y-3"><h2 className="a-h2">Per person</h2>{data.people.filter(p => !personId || p.id === personId).map(p => <div key={p.id} className="border-b border-[var(--a-separator)] pb-3 break-words"><h3>{p.full_name}{!p.active && ' (inaktiv)'}</h3><p>Planlagte timer: {decimal(p.summary.plannedMs / 3600000)} · Arbeidede timer: {decimal(p.summary.workedMs / 3600000)}</p><p>Planlagt beløp (anslag): {hoursMoney(p.summary.plannedAmountOre)} · {p.summary.missingWorkedRateCount ? 'Foreløpig beløp' : 'Beløp'}: {hoursMoney(p.summary.workedAmountOre)}</p></div>)}</section>}
    <section className="a-card a-section space-y-3"><h2 className="a-h2">Åpne registreringer ({open.length})</h2><p className="a-muted">Vises uansett valgt periode. Ikke med i arbeidede timer eller beløp.</p>
      <p>Glemte utstemplinger: {open.filter(e => e.forgotten).length}</p>
      {!open.length && <p>Ingen åpne registreringer.</p>}
      {open.map(e => <p key={e.id} className="break-words"><Link className="a-link" href={`/admin/timer/${e.id}`}>{e.personName} · {formatDateTime(e.started_at)}</Link>{e.forgotten && <strong className="block">Glemt å stemple ut?</strong>}</p>)}
    </section>
    <section className="space-y-3"><h2 className="a-h2">Arbeidede dagsrader</h2>{!segments.some(s => s.sourceKind === 'time') && <p>Ingen registrerte timer i perioden.</p>}
      {segments.filter(s => s.sourceKind === 'time').map(s => {
        const entry = data.entries.find(e => e.id === s.sourceId)
        return <article className="a-card a-section space-y-2 break-words" key={`${s.sourceId}-${s.date}`}>
          <h3>{s.date}{owner && ` · ${data.people.find(p => p.id === s.profileId)?.full_name ?? 'Ukjent'}`}</h3>
          {entry && <p>{formatDateTime(entry.started_at)} – {formatDateTime(entry.ended_at)} · {!entry.shift_id && 'Uplanlagt'}</p>}
          <p>{decimal(s.durationMs / 3600000)} timer · Timesats: {s.rateOre === null ? 'Mangler timesats' : hoursMoney(s.rateOre)} · {s.amountOre === null ? 'Mangler timesats' : hoursMoney(s.amountOre)}</p>
          {s.durationMs === 0 && <p>Nullvarig korrigering</p>}
          <Link className="a-link" href={`/admin/timer/${s.sourceId}`}>Vis registrering</Link>
        </article>
      })}
    </section>
  </div>
}
