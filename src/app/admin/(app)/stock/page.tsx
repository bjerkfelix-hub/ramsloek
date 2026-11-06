import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatDate, isExpired } from '@/lib/domain/time'
import { StockWasteForm } from './waste-form'
import { LargeTitle, Page } from '@/features/admin/ui/Page'
import { ResponsiveSheet } from '@/features/admin/ui/ResponsiveSheet'

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
    <Page>
      <LargeTitle>Lager</LargeTitle>
      {sorted.length === 0 && <p className="a-sub">Ingenting på lager.</p>}
      {sorted.map(([productId, g]) => (
        <section key={productId} className="a-section">
          <div className="flex items-baseline justify-between gap-3 px-1">
            <h2 className="a-h2">{g.name}</h2>
            <p className="a-sub whitespace-nowrap">Totalt {g.rows.reduce((s, r) => s + r.units, 0)} stk</p>
          </div>
          <ul className="a-list">
            {g.rows.map((r) => (
              <li key={r.batch_id} data-testid="stock-row" className="flex flex-col gap-3 p-4">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-semibold">{r.lot_number}</span>
                  <span>
                    · {r.units} stk · Best før {r.best_before ? formatDate(r.best_before) : '–'}
                  </span>
                  {r.best_before && isExpired(r.best_before) ? (
                    <span className="a-badge a-badge-danger">Utgått</span>
                  ) : (
                    r.near_expiry && <span className="a-badge a-badge-warn">Går ut snart</span>
                  )}
                </p>
                {canWrite && (
                  <ResponsiveSheet
                    title={`Svinn – ${r.lot_number}`}
                    triggerLabel="Registrer svinn"
                    triggerClassName="a-btn a-btn-tinted a-btn-sm self-start"
                    card={false}
                  >
                    <StockWasteForm batchId={r.batch_id} productId={r.product_id} />
                  </ResponsiveSheet>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </Page>
  )
}
