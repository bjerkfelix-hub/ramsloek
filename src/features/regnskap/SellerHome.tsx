import { formatKr } from '@/lib/domain/money'
import { PAYMENT_LABEL } from '@/lib/domain/ledger'
import { formatDate } from '@/lib/domain/time'
import { QuickActions } from './QuickActions'
import type { MyEntry } from './queries'

export function SellerHome({ entries }: { entries: MyEntry[] }) {
  return (
    <>
      <QuickActions />
      <section className="a-section" aria-labelledby="mine-title">
        <h2 id="mine-title" className="a-h2 px-1">Mine registreringer</h2>
        {entries.length === 0 ? (
          <p className="a-sub px-1">Ingen registreringer de siste 30 dagene.</p>
        ) : (
          <ul className="a-list">
            {entries.map((e) => (
              <li key={e.id} data-testid="my-entry" className="flex flex-col gap-1 p-4">
                <p className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="font-semibold">{e.number}</span>
                  <span className={e.voided ? 'line-through a-muted' : 'font-medium'}>
                    {e.kind === 'expense' ? '−' : ''}
                    {formatKr(e.amountOre)}
                  </span>
                </p>
                <p className="a-sub">
                  {formatDate(e.entryDate)} · {e.description} · {PAYMENT_LABEL[e.paymentMethod]}
                </p>
                <p className="flex flex-wrap gap-2">
                  {e.voided && <span className="a-badge a-badge-neutral">Annullert</span>}
                  {!e.voided &&
                    (e.hasReceipt ? (
                      <span className="a-badge a-badge-ok">Kvittering</span>
                    ) : (
                      <span className="a-badge a-badge-warn">Mangler kvittering</span>
                    ))}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
