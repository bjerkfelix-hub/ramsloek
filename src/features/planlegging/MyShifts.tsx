import type { MyShiftWeeks } from './queries'
import { SHIFT_LABEL } from '@/lib/domain/planning'
import { formatDateTime } from '@/lib/domain/time'
export function MyShifts({ data }: { data: MyShiftWeeks }) {
  return <section className="space-y-4"><h2 className="a-h2">Mine vakter</h2>{data.weeks.map((week,i) => <section className="a-card a-section" key={week.monday}>
    <h3 className="a-h2">{i === 0 ? 'Denne uken' : 'Neste uke'} · {week.monday}</h3>
    <p>{(week.plannedMs / 3600000).toLocaleString('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} timer</p>
    {!week.shifts.length && <p>Du har ingen vakter denne uken.</p>}
    <ul className="space-y-3">{week.shifts.map(s => <li key={s.id} className={s.cancelled_at ? 'a-muted' : ''}>
      <p>{formatDateTime(s.starts_at)} – {formatDateTime(s.ends_at)} · {SHIFT_LABEL[s.kind]} {s.cancelled_at && <strong>Avlyst</strong>}</p>
      {s.note && <p className="break-words">{s.note}</p>}
    </li>)}</ul>
  </section>)}</section>
}
