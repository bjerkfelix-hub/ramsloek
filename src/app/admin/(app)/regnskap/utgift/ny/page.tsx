import { requireRole } from '@/lib/auth'
import { todayOslo } from '@/lib/domain/time'
import { LargeTitle, Page } from '@/features/admin/ui/Page'
import { EntryForm } from '@/features/regnskap/EntryForm'
import { activeCategories, addDays } from '@/features/regnskap/form-data'

export default async function NewExpensePage() {
  await requireRole('owner', 'seller')
  const today = todayOslo()
  return (
    <Page>
      <LargeTitle>Ny utgift</LargeTitle>
      <div className="a-card">
        <EntryForm kind="expense" categories={await activeCategories('expense')} today={today} maxDate={addDays(today, 1)} />
      </div>
    </Page>
  )
}
