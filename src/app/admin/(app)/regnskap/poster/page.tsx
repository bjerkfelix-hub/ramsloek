import Link from 'next/link'
import { requireRole } from '@/lib/auth'
import { formatKr } from '@/lib/domain/money'
import { PAYMENT_LABEL, type LedgerKind } from '@/lib/domain/ledger'
import { parsePeriod, presetPeriod } from '@/lib/domain/periods'
import { formatDate, todayOslo } from '@/lib/domain/time'
import { Chevron } from '@/features/admin/ui/icons'
import { LargeTitle, Page } from '@/features/admin/ui/Page'
import { listEntries, type EntryFlag } from '@/features/regnskap/entries'
import { activeCategories } from '@/features/regnskap/form-data'
import { UUID } from '@/features/regnskap/entry-input'
import '@/features/regnskap/regnskap.css'

const ALL_DATES = { from: '2000-01-01', to: '2099-12-31' }

type Search = { from?: string; to?: string; kind?: string; category?: string; flag?: string; voided?: string }

const FLAGS: { value: EntryFlag; label: string }[] = [
  { value: 'missing-receipt', label: 'Mangler kvittering' },
  { value: 'unpaid', label: 'Ubetalt' },
  { value: 'private', label: 'Lagt ut privat' },
]

export default async function EntriesPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireRole('owner')
  const sp = await searchParams
  const kind = sp.kind === 'income' || sp.kind === 'expense' ? (sp.kind as LedgerKind) : null
  const categoryId = sp.category && UUID.test(sp.category) ? sp.category : null
  const flag = FLAGS.some((f) => f.value === sp.flag) ? (sp.flag as EntryFlag) : null
  // The overview's follow-up counts (missing receipt, unpaid, owed back) cover all dates, so its links
  // (a flag and no period) list all dates too; otherwise the default period is this year.
  const allDates = flag !== null && !sp.from && !sp.to
  const period = allDates
    ? ALL_DATES
    : (parsePeriod(sp.from ?? null, sp.to ?? null) ?? presetPeriod('this-year', todayOslo()))
  const showVoided = sp.voided === '1'

  const [rows, income, expense] = await Promise.all([
    listEntries({ period, kind, categoryId, flag, showVoided }),
    activeCategories('income'),
    activeCategories('expense'),
  ])

  return (
    <Page>
      <LargeTitle>Poster</LargeTitle>
      <form method="get" className="a-card r-filters" aria-label="Filter">
        <label className="a-field">
          Fra
          <input type="date" name="from" defaultValue={allDates ? '' : period.from} className="a-input" />
        </label>
        <label className="a-field">
          Til
          <input type="date" name="to" defaultValue={allDates ? '' : period.to} className="a-input" />
        </label>
        <label className="a-field">
          Type
          <select name="kind" defaultValue={kind ?? ''} className="a-input">
            <option value="">Alle</option>
            <option value="income">Inntekt</option>
            <option value="expense">Utgift</option>
          </select>
        </label>
        <label className="a-field">
          Kategori
          <select name="category" defaultValue={categoryId ?? ''} className="a-input">
            <option value="">Alle</option>
            {[...income, ...expense].map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.accountNo})
              </option>
            ))}
          </select>
        </label>
        <label className="a-field">
          Vis
          <select name="flag" defaultValue={flag ?? ''} className="a-input">
            <option value="">Alle poster</option>
            {FLAGS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label className="a-check self-end">
          <input type="checkbox" name="voided" value="1" defaultChecked={showVoided} />
          Vis annullerte
        </label>
        <button type="submit" className="a-btn a-btn-tinted r-filters-submit">
          Vis
        </button>
      </form>

      <p className="a-sub px-1" data-testid="entries-count">
        {rows.length} {rows.length === 1 ? 'post' : 'poster'}, {allDates ? 'alle datoer' : `${formatDate(period.from)} – ${formatDate(period.to)}`}
      </p>
      {rows.length > 0 && (
        <ul className="a-list">
          {rows.map((r) => (
            <li key={r.id} data-testid="entry-row">
              <Link href={`/admin/regnskap/poster/${r.id}`} className="a-row a-row-link r-entry">
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-semibold">
                    {r.number} · {r.category}
                  </span>
                  <span className="a-sub truncate">
                    {formatDate(r.entryDate)} · {r.counterparty ? `${r.counterparty} · ` : ''}
                    {r.description} · {PAYMENT_LABEL[r.paymentMethod]}
                  </span>
                  <span className="flex flex-wrap gap-1.5">
                    {r.voided && <span className="a-badge a-badge-neutral">Annullert</span>}
                    {!r.voided && !r.hasReceipt && <span className="a-badge a-badge-warn">Mangler kvittering</span>}
                    {!r.voided && r.paymentMethod === 'unpaid' && !r.settledAt && (
                      <span className="a-badge a-badge-danger">Ubetalt</span>
                    )}
                    {!r.voided && r.paymentMethod === 'private' && !r.settledAt && (
                      <span className="a-badge a-badge-warn">Lagt ut privat</span>
                    )}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <span className={`r-amount ${r.voided ? 'line-through a-muted' : ''} ${r.kind === 'expense' ? '' : 'r-income'}`}>
                    {r.kind === 'expense' ? '−' : '+'}
                    {formatKr(r.amountOre)}
                  </span>
                  <Chevron />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Page>
  )
}
