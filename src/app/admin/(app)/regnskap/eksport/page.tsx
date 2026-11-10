import Link from 'next/link'
import { requireRole } from '@/lib/auth'
import { formatKr } from '@/lib/domain/money'
import { summarize } from '@/lib/domain/ledger'
import { parsePeriod, presetPeriod, type PeriodPreset } from '@/lib/domain/periods'
import { formatDate, todayOslo } from '@/lib/domain/time'
import { LargeTitle, Page } from '@/features/admin/ui/Page'
import { loadExport } from '@/features/regnskap/export-data'
import '@/features/regnskap/regnskap.css'

const PRESETS: { value: PeriodPreset; label: string }[] = [
  { value: 'this-month', label: 'Denne måneden' },
  { value: 'last-month', label: 'Forrige måned' },
  { value: 'this-year', label: 'I år' },
  { value: 'last-year', label: 'I fjor' },
]

export default async function ExportPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  await requireRole('owner')
  const sp = await searchParams
  const today = todayOslo()
  const period = parsePeriod(sp.from ?? null, sp.to ?? null) ?? presetPeriod('this-year', today)
  const { entries, files } = await loadExport(period)
  const { totals } = summarize(entries)
  const qs = `from=${period.from}&to=${period.to}`

  return (
    <Page>
      <LargeTitle>Eksport</LargeTitle>
      <p className="a-sub">
        Excel-filen har alle poster med kontonummer, summer per kategori og per måned. Zip-filen har alle kvitteringene, navngitt etter postnummer, så de
        kan føres i hovedboken til DONTPANIC AS.
      </p>

      <nav aria-label="Periode" className="flex flex-wrap gap-2">
        {PRESETS.map((p) => {
          const pp = presetPeriod(p.value, today)
          const active = pp.from === period.from && pp.to === period.to
          return (
            <Link
              key={p.value}
              href={`/admin/regnskap/eksport?from=${pp.from}&to=${pp.to}`}
              className={`a-btn a-btn-sm ${active ? 'a-btn-primary' : 'a-btn-gray'}`}
              aria-current={active ? 'true' : undefined}
            >
              {p.label}
            </Link>
          )
        })}
      </nav>

      <form method="get" className="a-card r-filters" aria-label="Egen periode">
        <label className="a-field">
          Fra
          <input type="date" name="from" defaultValue={period.from} className="a-input" />
        </label>
        <label className="a-field">
          Til
          <input type="date" name="to" defaultValue={period.to} className="a-input" />
        </label>
        <button type="submit" className="a-btn a-btn-tinted r-filters-submit">
          Velg periode
        </button>
      </form>

      <section className="a-card r-totals" aria-labelledby="export-title">
        <h2 id="export-title" className="a-h2">
          {formatDate(period.from)} – {formatDate(period.to)}
        </h2>
        <dl>
          <div>
            <dt>Poster</dt>
            <dd data-testid="export-count">{entries.length}</dd>
          </div>
          <div>
            <dt>Kvitteringer</dt>
            <dd>{files.length}</dd>
          </div>
          <div>
            <dt>Inntekt</dt>
            <dd>{formatKr(totals.incomeOre)}</dd>
          </div>
          <div>
            <dt>Kostnader</dt>
            <dd>{formatKr(totals.expenseOre)}</dd>
          </div>
          <div className="r-totals-result">
            <dt>Resultat</dt>
            <dd>{totals.profitOre < 0 ? `−${formatKr(-totals.profitOre)}` : formatKr(totals.profitOre)}</dd>
          </div>
        </dl>
      </section>

      <div className="r-actions">
        <a href={`/api/regnskap/export.xlsx?${qs}`} className="a-btn a-btn-primary r-action" download>
          Last ned Excel
        </a>
        <a href={`/api/regnskap/receipts.zip?${qs}`} className="a-btn a-btn-tinted r-action" download>
          Last ned kvitteringer
        </a>
      </div>
    </Page>
  )
}
