import { formatDateTime } from '@/lib/domain/time'
import type { TimeAudit, TimeEntryDetail } from './queries'
const state = (row: Partial<TimeEntryDetail> | undefined) => row ? `${row.started_at} – ${row.ended_at ?? 'Åpen'} · Timesats: ${row.hourly_rate_ore === null ? 'Mangler timesats' : `${(row.hourly_rate_ore! / 100).toLocaleString('nb-NO')} kr/time`}` : 'Ny registrering'
export function TimeHistory({ history }: { history: TimeAudit[] }) {
  return <section className="a-card a-section space-y-3"><h2 className="a-h2">Historikk</h2>
    <ul className="space-y-3">{history.map(row => <li key={row.id} className="break-words">
      <p>{formatDateTime(row.at)} · {row.actorName}</p>
      <p>{state(row.data.old)} → {state(row.data.new)}</p>
      {row.data.new?.correction_reason && <p>{row.data.new.correction_reason}</p>}
    </li>)}</ul>
  </section>
}
