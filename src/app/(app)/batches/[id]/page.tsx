import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatGrams } from '@/lib/domain/weight'
import { formatDate, formatDateTime } from '@/lib/domain/time'
import { SortingBadge } from '@/components/sorting-badge'
import { SignButton, TemperatureForm } from './batch-actions'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const nbTemp = new Intl.NumberFormat('nb-NO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

export default async function BatchPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole('owner', 'picker', 'seller')
  const { id } = await params
  if (!UUID.test(id)) notFound()
  const supabase = await createClient()

  const { data: batch } = await supabase
    .from('batches')
    .select('id, lot_number, harvested_at, pickers, gross_weight_g, notes, harvest_areas(name)')
    .eq('id', id)
    .maybeSingle()
  if (!batch) notFound()

  const [{ data: check }, { data: temps }, { data: remaining }] = await Promise.all([
    supabase.from('sorting_checks').select('statement, checked_by, checked_at').eq('batch_id', id).maybeSingle(),
    supabase.from('temperature_logs').select('id, measured_at, celsius, logged_by').eq('batch_id', id).order('measured_at', { ascending: false }),
    supabase.rpc('batch_remaining_g', { p_batch: id }),
  ])
  const personIds = [...new Set([check?.checked_by, ...(temps ?? []).map((t) => t.logged_by)].filter(Boolean) as string[])]
  const { data: people } = personIds.length
    ? await supabase.from('profiles').select('id, full_name').in('id', personIds)
    : { data: [] }
  const nameOf = (uid: string) => people?.find((p) => p.id === uid)?.full_name ?? '–'
  const area = Array.isArray(batch.harvest_areas) ? batch.harvest_areas[0] : batch.harvest_areas
  const canWrite = user.role === 'owner' || user.role === 'picker'

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">{batch.lot_number}</h1>
        <SortingBadge signed={!!check} />
        <p className="text-sm text-zinc-700">
          {formatDate(batch.harvested_at)} · {area?.name ?? '–'} · {batch.pickers}
        </p>
        <p className="text-sm">
          Brutto {formatGrams(batch.gross_weight_g)} · Igjen {remaining != null ? formatGrams(remaining) : '–'}
        </p>
        {batch.notes && <p className="text-sm text-zinc-700">{batch.notes}</p>}
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Sorteringskontroll</h2>
        {check ? (
          <div className="rounded border border-green-300 bg-green-50 p-3 text-sm">
            <p>{check.statement}</p>
            <p className="mt-1 text-zinc-700">
              Signert av {nameOf(check.checked_by)} {formatDateTime(check.checked_at)}
            </p>
          </div>
        ) : canWrite ? (
          <SignButton batchId={id} />
        ) : (
          <p className="text-sm text-zinc-700">Ikke signert ennå.</p>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Temperatur</h2>
        {canWrite && <TemperatureForm batchId={id} />}
        <ul data-testid="temperature-list" className="flex flex-col gap-1 text-sm">
          {temps?.map((t) => (
            <li key={t.id}>
              {nbTemp.format(Number(t.celsius))} °C · {formatDateTime(t.measured_at)} · {nameOf(t.logged_by)}
            </li>
          ))}
        </ul>
      </section>

      {/* Task 9 fills in packing and stock here. */}
      <div
        role="group"
        aria-label="Pakking"
        data-testid="pack-section"
        aria-disabled={!check}
        className={`flex flex-col gap-2 ${check ? '' : 'opacity-50'}`}
      >
        <h2 className="text-lg font-medium">Pakking</h2>
        {!check && <p className="text-sm text-zinc-700">Signer sorteringskontrollen før pakking.</p>}
      </div>
    </div>
  )
}
