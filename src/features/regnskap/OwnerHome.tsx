import Link from 'next/link'
import { formatKr } from '@/lib/domain/money'
import { Chevron } from '@/features/admin/ui/icons'
import { MvaMeter } from './MvaMeter'
import { QuickActions } from './QuickActions'
import type { OwnerOverview, Totals } from './queries'

function TotalsCard({ title, totals, id }: { title: string; totals: Totals; id: string }) {
  return (
    <section className="a-card r-totals" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="a-h2">{title}</h2>
      <dl>
        <div>
          <dt>Inntekt</dt>
          <dd data-testid={`${id}-income`}>{formatKr(totals.incomeOre)}</dd>
        </div>
        <div>
          <dt>Kostnader</dt>
          <dd data-testid={`${id}-expense`}>{formatKr(totals.expenseOre)}</dd>
        </div>
        <div className="r-totals-result">
          <dt>Resultat</dt>
          <dd data-testid={`${id}-profit`} className={totals.profitOre < 0 ? 'r-negative' : ''}>
            {totals.profitOre < 0 ? `−${formatKr(-totals.profitOre)}` : formatKr(totals.profitOre)}
          </dd>
        </div>
      </dl>
    </section>
  )
}

const LINKS = [
  { href: '/admin/regnskap/poster', label: 'Poster' },
  { href: '/admin/regnskap/inntekt/ny', label: 'Annen inntekt' },
  { href: '/admin/regnskap/kategorier', label: 'Kategorier' },
  { href: '/admin/regnskap/eksport', label: 'Eksport' },
]

export function OwnerHome({ overview }: { overview: OwnerOverview }) {
  const { month, year, missingReceipts, unpaid, owedBack, meter } = overview
  return (
    <>
      <QuickActions />
      <div className="r-grid">
        <TotalsCard title="Denne måneden" totals={month} id="month" />
        <TotalsCard title="I år" totals={year} id="year" />
      </div>

      <section className="a-section" aria-labelledby="alerts-title">
        <h2 id="alerts-title" className="a-h2 px-1">Følg opp</h2>
        <ul className="a-list">
          <li>
            <Link href="/admin/regnskap/poster?flag=missing-receipt" className="a-row a-row-link" data-testid="missing-receipts">
              <span>Mangler kvittering</span>
              <span className="flex items-center gap-2">
                <span className={missingReceipts > 0 ? 'a-badge a-badge-warn' : 'a-badge a-badge-ok'}>{missingReceipts}</span>
                <Chevron />
              </span>
            </Link>
          </li>
          <li>
            <Link href="/admin/regnskap/poster?flag=unpaid" className="a-row a-row-link" data-testid="unpaid">
              <span>Ubetalte regninger</span>
              <span className="flex items-center gap-2">
                <span className="a-sub">
                  {unpaid.count} · {formatKr(unpaid.totalOre)}
                </span>
                <Chevron />
              </span>
            </Link>
          </li>
          <li>
            <Link href="/admin/regnskap/poster?flag=private" className="a-row a-row-link" data-testid="owed-back">
              <span>Skyldes tilbake</span>
              <span className="flex items-center gap-2">
                <span className="a-sub">
                  {owedBack.length === 0
                    ? 'Ingen'
                    : owedBack.map((p) => `${p.name} ${formatKr(p.totalOre)}`).join(' · ')}
                </span>
                <Chevron />
              </span>
            </Link>
          </li>
        </ul>
      </section>

      <MvaMeter incomeOre={meter.incomeOre} level={meter.level} />

      <ul className="a-list" aria-label="Regnskap">
        {LINKS.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="a-row a-row-link font-medium">
              {l.label}
              <Chevron />
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}
