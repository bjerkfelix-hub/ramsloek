import Link from 'next/link'
import { requireRole } from '@/lib/auth'
import { LargeTitle, Page } from '@/features/admin/ui/Page'
import { ClockPanel } from '@/features/planlegging/ClockPanel'
import { getMyOpenEntry, getForgottenEntries } from '@/features/planlegging/queries'
import { formatDateTime } from '@/lib/domain/time'

export default async function ClockPage() {
  const me = await requireRole('owner', 'picker', 'seller')
  const [entry, forgotten] = await Promise.all([getMyOpenEntry(), me.role === 'owner' ? getForgottenEntries() : Promise.resolve([])])
  return <Page><LargeTitle>Stemple</LargeTitle>
    <ClockPanel entry={entry} profileId={me.id} />
    <Link className="a-btn a-btn-tinted" href="/admin/vaktplan">Mine vakter</Link>
    {forgotten.length > 0 && <section className="a-card a-section"><h2 className="a-h2">Glemt å stemple ut?</h2><ul className="space-y-3">{forgotten.map(e => <li key={e.id}><Link href={`/admin/timer/${e.id}`}>{e.personName} · {formatDateTime(e.started_at)}</Link></li>)}</ul></section>}
  </Page>
}
