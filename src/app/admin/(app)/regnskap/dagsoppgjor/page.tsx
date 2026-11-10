import { requireRole } from '@/lib/auth'
import { LargeTitle, Page } from '@/features/admin/ui/Page'
import { TakingsForm } from '@/features/regnskap/TakingsForm'
import { takingsDays } from '@/features/regnskap/form-data'

export default async function TakingsPage() {
  await requireRole('owner', 'seller')
  return (
    <Page>
      <LargeTitle>Dagsoppgjør</LargeTitle>
      <p className="a-sub">Skriv inn dagens totaler fra Vipps, kortterminalen og kassen. Tomme felt teller som 0.</p>
      <div className="a-card">
        <TakingsForm days={await takingsDays()} />
      </div>
    </Page>
  )
}
