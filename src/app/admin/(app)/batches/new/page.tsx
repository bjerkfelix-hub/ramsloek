import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { LargeTitle, Page } from '@/features/admin/ui/Page'
import { NewBatchForm } from './new-batch-form'

export default async function NewBatchPage() {
  await requireRole('owner', 'picker')
  const supabase = await createClient()
  const { data: areas } = await supabase.from('harvest_areas').select('id, name').eq('active', true).order('name')
  return (
    <Page>
      <LargeTitle>Ny høsting</LargeTitle>
      <div className="a-card">
        <NewBatchForm areas={areas ?? []} />
      </div>
    </Page>
  )
}
