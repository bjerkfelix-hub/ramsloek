import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { NewBatchForm } from './new-batch-form'

export default async function NewBatchPage() {
  await requireRole('owner', 'picker')
  const supabase = await createClient()
  const { data: areas } = await supabase.from('harvest_areas').select('id, name').eq('active', true).order('name')
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Ny høsting</h1>
      <NewBatchForm areas={areas ?? []} />
    </div>
  )
}
