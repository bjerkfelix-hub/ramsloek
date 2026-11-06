import Link from 'next/link'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatGrams } from '@/lib/domain/weight'
import { formatDate } from '@/lib/domain/time'
import { SortingBadge } from '@/components/sorting-badge'

export default async function BatchesPage() {
  const user = await requireRole('owner', 'picker', 'seller')
  const supabase = await createClient()
  const { data: batches } = await supabase
    .from('batches')
    .select('id, lot_number, harvested_at, gross_weight_g, harvest_areas(name), sorting_checks(batch_id)')
    .order('harvested_at', { ascending: false })
    .order('created_at', { ascending: false })
  const remaining = await Promise.all(
    (batches ?? []).map(async (b) => {
      const { data } = await supabase.rpc('batch_remaining_g', { p_batch: b.id })
      return data as number | null
    }),
  )
  const canCreate = user.role === 'owner' || user.role === 'picker'

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Partier</h1>
        {canCreate && (
          <Link href="/admin/batches/new" className="rounded bg-green-800 px-4 py-3 text-base font-medium text-white">
            Ny høsting
          </Link>
        )}
      </div>
      <ul className="flex flex-col gap-2">
        {batches?.map((b, i) => {
          const area = Array.isArray(b.harvest_areas) ? b.harvest_areas[0] : b.harvest_areas
          const signed = Array.isArray(b.sorting_checks) ? b.sorting_checks.length > 0 : !!b.sorting_checks
          return (
            <li key={b.id} data-testid="batch-row">
              <Link href={`/admin/batches/${b.id}`} className="flex flex-col gap-1 rounded border border-zinc-300 p-3">
                <span className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{b.lot_number}</span>
                  <SortingBadge signed={signed} />
                </span>
                <span className="text-sm text-zinc-700">
                  {formatDate(b.harvested_at)} · {area?.name ?? '–'}
                </span>
                <span className="text-sm text-zinc-700">
                  Brutto {formatGrams(b.gross_weight_g)} · Igjen {remaining[i] != null ? formatGrams(remaining[i]!) : '–'}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
      {batches?.length === 0 && <p className="text-sm text-zinc-700">Ingen partier ennå.</p>}
    </div>
  )
}
