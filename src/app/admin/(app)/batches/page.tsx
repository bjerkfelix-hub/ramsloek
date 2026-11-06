import Link from 'next/link'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatGrams } from '@/lib/domain/weight'
import { formatDate } from '@/lib/domain/time'
import { SortingBadge } from '@/components/sorting-badge'
import { Chevron } from '@/features/admin/ui/icons'
import { LargeTitle, Page } from '@/features/admin/ui/Page'
import { ResponsiveSheet } from '@/features/admin/ui/ResponsiveSheet'
import { NewBatchForm } from './new/new-batch-form'

export default async function BatchesPage() {
  const user = await requireRole('owner', 'picker', 'seller')
  const supabase = await createClient()
  const canCreate = user.role === 'owner' || user.role === 'picker'
  const [{ data: batches }, { data: areas }] = await Promise.all([
    supabase
      .from('batches')
      .select('id, lot_number, harvested_at, gross_weight_g, harvest_areas(name), sorting_checks(batch_id)')
      .order('harvested_at', { ascending: false })
      .order('created_at', { ascending: false }),
    canCreate
      ? supabase.from('harvest_areas').select('id, name').eq('active', true).order('name')
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ])
  const remaining = await Promise.all(
    (batches ?? []).map(async (b) => {
      const { data } = await supabase.rpc('batch_remaining_g', { p_batch: b.id })
      return data as number | null
    }),
  )

  return (
    <Page>
      <LargeTitle
        action={
          canCreate && (
            // Phones: the form opens in a sheet. Wider screens: its own page.
            <ResponsiveSheet
              title="Ny høsting"
              triggerClassName="a-btn a-btn-primary a-btn-sm"
              wide={
                <Link href="/admin/batches/new" className="a-btn a-btn-primary a-btn-sm">
                  Ny høsting
                </Link>
              }
            >
              <NewBatchForm areas={areas ?? []} />
            </ResponsiveSheet>
          )
        }
      >
        Partier
      </LargeTitle>
      {batches && batches.length > 0 && (
        <ul className="a-list">
          {batches.map((b, i) => {
            const area = Array.isArray(b.harvest_areas) ? b.harvest_areas[0] : b.harvest_areas
            const signed = Array.isArray(b.sorting_checks) ? b.sorting_checks.length > 0 : !!b.sorting_checks
            return (
              <li key={b.id} data-testid="batch-row">
                <Link href={`/admin/batches/${b.id}`} className="a-row a-row-link">
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <span className="font-semibold">{b.lot_number}</span>
                      <SortingBadge signed={signed} />
                    </span>
                    <span className="a-sub">
                      {formatDate(b.harvested_at)} · {area?.name ?? '–'}
                    </span>
                    <span className="a-sub">
                      Brutto {formatGrams(b.gross_weight_g)} · Igjen {remaining[i] != null ? formatGrams(remaining[i]!) : '–'}
                    </span>
                  </span>
                  <Chevron />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
      {batches?.length === 0 && <p className="a-sub">Ingen partier ennå.</p>}
    </Page>
  )
}
