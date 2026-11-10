import { requireRole } from '@/lib/auth'
import { todayOslo } from '@/lib/domain/time'
import { LargeTitle, Page } from '@/features/admin/ui/Page'
import { getMyRecent, getOwnerOverview } from '@/features/regnskap/queries'
import { OwnerHome } from '@/features/regnskap/OwnerHome'
import { SellerHome } from '@/features/regnskap/SellerHome'
import '@/features/regnskap/regnskap.css'

export default async function RegnskapPage() {
  const user = await requireRole('owner', 'seller')
  return (
    <Page>
      <LargeTitle>Regnskap</LargeTitle>
      {user.role === 'owner' ? (
        <OwnerHome overview={await getOwnerOverview(todayOslo())} />
      ) : (
        <SellerHome entries={await getMyRecent(user.id)} />
      )}
    </Page>
  )
}
