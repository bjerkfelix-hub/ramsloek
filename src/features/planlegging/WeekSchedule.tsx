'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sheet } from '@/features/admin/ui/Sheet'
import { ResponsiveSheet } from '@/features/admin/ui/ResponsiveSheet'
import { ActionForm } from '@/components/action-form'
import { copyWeek } from '@/app/admin/(app)/vaktplan/actions'
import { nextWeekMonday, splitAtOsloMidnight, SHIFT_LABEL } from '@/lib/domain/planning'
import { formatDateTime, todayOslo } from '@/lib/domain/time'
import { ShiftForm } from './ShiftForm'
import type { WeekScheduleData, WorkShift } from './queries'
export function WeekSchedule({ data }: { data: WeekScheduleData }) {
  const [selected, setSelected] = useState<WorkShift | null>(null)
  const router = useRouter()
  const next = nextWeekMonday(data.monday)
  const days = Array.from({ length: 7 }, (_,i) => new Date(Date.parse(`${data.monday}T12:00:00Z`) + i * 86400000).toISOString().slice(0,10))
  return <section className="space-y-4 min-w-0">
    <form className="a-form" action="/admin/vaktplan"><label className="a-field">Uke (mandag)<input className="a-input" type="date" name="week" defaultValue={data.monday} required /></label><button className="a-btn a-btn-tinted">Vis uke</button></form>
    <ResponsiveSheet title="Ny vakt"><ShiftForm people={data.people} monday={data.monday} /></ResponsiveSheet>
    <div className="a-table-wrap max-w-full overflow-x-auto" tabIndex={0} aria-label="Vaktplan ukeoversikt">
      <table className="a-table" style={{ minWidth: 1500, tableLayout: 'fixed' }}><thead><tr><th className="sticky left-0 z-10 bg-[var(--a-card)]" style={{ width: 160 }}>Person</th>{days.map(d => <th key={d}>{d}</th>)}<th>Timer</th></tr></thead><tbody>
        {data.people.map(person => { const shifts = data.shifts.filter(s => s.profile_id === person.id); const segments = shifts.filter(s => !s.cancelled_at).flatMap(s => splitAtOsloMidnight(s.starts_at,s.ends_at)).filter(s => days.includes(s.date)); return <tr key={person.id}>
          <th className="sticky left-0 z-10 bg-[var(--a-card)]" style={{ width: 160, whiteSpace: 'normal', overflowWrap: 'anywhere' }}>{person.full_name}{!person.active && ' (deaktivert)'}</th>
          {days.map(day => <td key={day}>{shifts.filter(s => splitAtOsloMidnight(s.starts_at,s.ends_at).some(seg => seg.date === day && seg.durationMs > 0)).map(s => <button
            className="a-btn a-btn-tinted w-full mb-2 py-3"
            aria-label={`${SHIFT_LABEL[s.kind]} ${formatDateTime(s.starts_at)} – ${formatDateTime(s.ends_at)} ${s.note ?? ''} ${s.cancelled_at ? 'Avlyst' : ''}`}
            key={s.id} onClick={() => setSelected(s)}
          >
            <span className="flex min-w-0 flex-col gap-1">
              <span>{SHIFT_LABEL[s.kind]}</span>
              <span className="text-sm">{shiftTime(s.starts_at)}–{shiftTime(s.ends_at)}</span>
              {todayOslo(new Date(s.starts_at)) !== todayOslo(new Date(s.ends_at)) && <span className="text-xs">{todayOslo(new Date(s.starts_at))} → {todayOslo(new Date(s.ends_at))}</span>}
              {s.note && <span className="line-clamp-2 break-words text-sm font-normal">{s.note}</span>}
              {s.cancelled_at && <strong>Avlyst</strong>}
            </span>
          </button>)}</td>)}<td>{(segments.reduce((sum,s) => sum+s.durationMs,0)/3600000).toLocaleString('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        </tr> })}
      </tbody></table>
    </div>
    <section className="a-card a-section"><h2 className="a-h2">Kopier til neste uke</h2><p>{data.monday} → {next}</p><p>{data.copyCount} vakter i kildeuken. Eksisterende kopier hoppes over, også avlyste og endrede kopier.</p>
      <ActionForm submitLabel="Kopier til neste uke" action={async () => { const result = await copyWeek(data.monday); if (result.ok) router.push(`/admin/vaktplan?week=${next}`); return result }}>{null}</ActionForm>
    </section>
    <Sheet open={!!selected} onClose={() => setSelected(null)} title={selected?.cancelled_at ? 'Avlyst vakt' : 'Rediger vakt'}>
      {selected && <><ShiftForm key={selected.id} people={data.people} monday={data.monday} shift={selected} /><h3 className="a-h2">Historikk</h3>
        <ul className="space-y-3">{data.history[selected.id]?.map(row => <li key={row.id}><p>{formatDateTime(row.at)} · {row.actorName}</p>
          {row.data.old ? <p>{describe(row.data.old)} → {describe(row.data.new ?? {})}</p> : <p>Opprettet: {describe(row.data.new ?? {})}</p>}
        </li>)}</ul></>}
    </Sheet>
  </section>
}
function describe(s: Partial<WorkShift>) { return [s.starts_at && formatDateTime(s.starts_at), s.ends_at && formatDateTime(s.ends_at), s.kind && SHIFT_LABEL[s.kind], s.note, s.cancelled_at && `Avlyst: ${s.cancel_reason}`].filter(Boolean).join(' · ') }

function shiftTime(value: string) {
  return new Intl.DateTimeFormat('nb-NO', { timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}
