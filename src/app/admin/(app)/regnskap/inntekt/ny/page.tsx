import { requireRole } from '@/lib/auth'
import { todayOslo } from '@/lib/domain/time'
import { LargeTitle, Page } from '@/features/admin/ui/Page'
import { EntryForm } from '@/features/regnskap/EntryForm'
import { activeCategories, addDays } from '@/features/regnskap/form-data'

export default async function NewIncomePage() {
  await requireRole('owner')
  const today = todayOslo()
  return (
    <Page>
      <LargeTitle>Annen inntekt</LargeTitle>
      <p className="a-sub">For inntekt som ikke er et dagsoppgjør fra marked, for eksempel en restaurant som betaler med bankoverføring.</p>
      <div className="a-card">
        <EntryForm kind="income" categories={await activeCategories('income')} today={today} maxDate={addDays(today, 1)} />
      </div>
    </Page>
  )
}
