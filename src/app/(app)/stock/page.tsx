import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatDate, isExpired } from '@/lib/domain/time'
import { StockWasteForm } from './waste-form'

type Row = {
  product_id: string
  product_name: string
  batch_id: string
  lot_number: string
  best_before: string | null
  units: number
  near_expiry: boolean
}

export default async function StockPage() {
  const user = await requireRole('owner', 'picker', 'seller')
  const canWrite = user.role === 'owner' || user.role === 'picker'
  const supabase = await createClient()
  const { data } = await supabase
    .from('stock_levels')
    .select('product_id, product_name, batch_id, lot_number, best_before, units, near_expiry')
    .order('best_before', { ascending: true })

  const groups = new Map<string, { name: string; rows: Row[] }>()
  for (const r of (data ?? []) as Row[]) {
    const g = groups.get(r.product_id) ?? { name: r.product_name, rows: [] }
    g.rows.push(r)
    groups.set(r.product_id, g)
  }
  const sorted = [...groups.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name, 'nb'))

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Lager</h1>
      {sorted.length === 0 && <p className="text-sm text-zinc-700">Ingenting på lager.</p>}
      {sorted.map(([productId, g]) => (
        <section key={productId} className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">{g.name}</h2>
          <p className="text-sm text-zinc-700">Totalt {g.rows.reduce((s, r) => s + r.units, 0)} stk</p>
          <ul className="flex flex-col gap-2">
            {g.rows.map((r) => (
              <li
                key={r.batch_id}
                data-testid="stock-row"
                className="flex flex-col gap-2 rounded border border-zinc-300 p-3"
              >
                <p className="text-sm">
                  <span className="font-medium">{r.lot_number}</span> · {r.units} stk · Best før{' '}
                  {r.best_before ? formatDate(r.best_before) : '–'}
                  {r.best_before && isExpired(r.best_before) ? (
                    <span className="ml-2 rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-900">Utgått</span>
                  ) : (
                    r.near_expiry && (
                      <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                        Går ut snart
                      </span>
                    )
                  )}
                </p>
                {canWrite && <StockWasteForm batchId={r.batch_id} productId={r.product_id} />}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
