import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { LargeTitle, Page } from '@/features/admin/ui/Page'
import { getTimeEntry } from '@/features/planlegging/queries'
import { TimeCorrectionSheet } from '@/features/planlegging/TimeCorrectionSheet'
import { TimeHistory } from '@/features/planlegging/TimeHistory'
import { formatDateTime } from '@/lib/domain/time'

export default async function TimeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireRole('owner', 'picker', 'seller')
  const { id } = await params
  const entry = await getTimeEntry(id)
  if (!entry) notFound()
  const duration = entry.ended_at ? Date.parse(entry.ended_at) - Date.parse(entry.started_at) : null
  return <Page><LargeTitle>Timeregistrering</LargeTitle>
    <section className="a-card a-section space-y-3">
      <h2 className="a-h2">{entry.personName}</h2>
      <p>{formatDateTime(entry.started_at)} – {entry.ended_at ? formatDateTime(entry.ended_at) : 'Åpen'}</p>
      <p className="a-muted break-words">{entry.started_at} → {entry.ended_at ?? 'Åpen'}</p>
      <p>{entry.shift_id ? 'Knyttet til planlagt vakt' : 'Uplanlagt'}</p>
      {duration === 0 ? <p>Null varighet</p> : duration !== null && <p>{(duration / 3600000).toLocaleString('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} timer</p>}
      <p>Timesats: {entry.hourly_rate_ore === null ? 'Mangler timesats' : `${(entry.hourly_rate_ore / 100).toLocaleString('nb-NO', { minimumFractionDigits: 2 })} kr/time`}</p>
      {entry.correction_reason && <p>Grunn for korrigering: {entry.correction_reason}</p>}
    </section>
    {me.role === 'owner' && <><TimeCorrectionSheet key={`${entry.id}:${entry.version}`} entry={entry} /><TimeHistory history={entry.history} /></>}
  </Page>
}
