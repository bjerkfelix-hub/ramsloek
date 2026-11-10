import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatKr } from '@/lib/domain/money'
import { PAYMENT_LABEL } from '@/lib/domain/ledger'
import { formatDate, formatDateTime, todayOslo } from '@/lib/domain/time'
import { LargeTitle, Page } from '@/features/admin/ui/Page'
import { getEntry } from '@/features/regnskap/entries'
import { UUID } from '@/features/regnskap/entry-input'
import { activeCategories, addDays } from '@/features/regnskap/form-data'
import { AddReceiptForm, EditEntryForm, SettleButton, VoidForm } from '@/features/regnskap/EntryActions'
import { describeHistory, type AuditRow } from '@/features/regnskap/history'
import '@/features/regnskap/regnskap.css'

type Receipt = { id: string; file_name: string; mime_type: string; uploaded_at: string }

export default async function EntryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ edit?: string }>
}) {
  await requireRole('owner')
  const { id } = await params
  const { edit } = await searchParams
  if (!UUID.test(id)) notFound()
  const entry = await getEntry(id)
  if (!entry) notFound()

  const supabase = await createClient()
  const receiptsQuery = supabase.from('ledger_receipts').select('id, file_name, mime_type, uploaded_at').order('uploaded_at')
  const [receiptsRes, auditRes, categoriesRes, siblingsRes, takingsRes, raw] = await Promise.all([
    entry.takingsId
      ? receiptsQuery.or(`entry_id.eq.${id},takings_id.eq.${entry.takingsId}`)
      : receiptsQuery.eq('entry_id', id),
    supabase
      .from('audit_log')
      .select('id, at, actor, action, data')
      .eq('table_name', 'ledger_entries')
      .eq('row_id', id)
      .order('id'),
    supabase.from('ledger_categories').select('id, name'),
    entry.takingsId
      ? supabase.from('ledger_entries').select('id, number, payment_method, amount_ore').eq('takings_id', entry.takingsId).order('number')
      : Promise.resolve({ data: [] as { id: string; number: string; payment_method: string; amount_ore: number }[] }),
    entry.takingsId
      ? supabase.from('market_takings').select('id, market_days(place_name, market_date)').eq('id', entry.takingsId).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('ledger_entries').select('category_id').eq('id', id).single(),
  ])
  const receipts = (receiptsRes.data ?? []) as Receipt[]
  const categoryNames = new Map((categoriesRes.data ?? []).map((c) => [c.id, c.name]))
  const audit = (auditRes.data ?? []) as AuditRow[]
  const actorIds = [...new Set(audit.map((a) => a.actor).filter((a): a is string => !!a))]
  const { data: people } = actorIds.length
    ? await supabase.from('profiles').select('id, full_name').in('id', actorIds)
    : { data: [] as { id: string; full_name: string }[] }
  const names = new Map((people ?? []).map((p) => [p.id, p.full_name]))
  const history = describeHistory(audit, categoryNames)
  const takings = takingsRes.data as { id: string; market_days: { place_name: string; market_date: string } | null } | null

  const editing = edit === '1' && !entry.voided && !entry.takingsId
  const settleLabel =
    entry.paymentMethod === 'unpaid' ? 'Marker betalt' : entry.paymentMethod === 'private' ? 'Marker tilbakebetalt' : null

  return (
    <Page>
      <Link href="/admin/regnskap/poster" className="a-link a-link-tap self-start">
        ← Poster
      </Link>
      <LargeTitle>{entry.number}</LargeTitle>
      {entry.voided && (
        <p className="a-note a-note-warn" role="note">
          Annullert: {entry.voidReason}
        </p>
      )}

      {editing ? (
        <section className="a-card a-section">
          <h2 className="a-h2">Rediger</h2>
          <Link href={`/admin/regnskap/poster/${id}`} className="a-link a-link-tap self-start">
            Avbryt redigering
          </Link>
          <EditEntryForm
            entry={{
              id,
              kind: entry.kind,
              entryDate: entry.entryDate,
              amountOre: entry.amountOre,
              categoryId: raw.data?.category_id ?? '',
              counterparty: entry.counterparty,
              description: entry.description,
              paymentMethod: entry.paymentMethod,
              dueDate: entry.dueDate,
            }}
            categories={await activeCategories(entry.kind)}
            maxDate={addDays(todayOslo(), 1)}
          />
        </section>
      ) : (
        <section className="a-card a-section">
          <dl className="r-facts" data-testid="entry-facts">
            <dt>Type</dt>
            <dd>{entry.kind === 'expense' ? 'Utgift' : 'Inntekt'}</dd>
            <dt>Dato</dt>
            <dd>{formatDate(entry.entryDate)}</dd>
            <dt>Beløp</dt>
            <dd data-testid="entry-amount" className={entry.voided ? 'line-through' : 'font-semibold'}>
              {formatKr(entry.amountOre)}
            </dd>
            <dt>Kategori</dt>
            <dd>
              {entry.category} ({entry.accountNo})
            </dd>
            {entry.counterparty && (
              <>
                <dt>{entry.kind === 'expense' ? 'Leverandør' : 'Kunde'}</dt>
                <dd>{entry.counterparty}</dd>
              </>
            )}
            <dt>Gjelder</dt>
            <dd>{entry.description}</dd>
            <dt>Betaling</dt>
            <dd>
              {PAYMENT_LABEL[entry.paymentMethod]}
              {entry.dueDate && ` · forfall ${formatDate(entry.dueDate)}`}
              {entry.settledAt && ` · oppgjort ${formatDate(entry.settledAt)}`}
            </dd>
          </dl>
          {!entry.voided && (
            <div className="flex flex-wrap items-center gap-3">
              {!entry.takingsId && (
                <Link href={`/admin/regnskap/poster/${id}?edit=1`} className="a-btn a-btn-gray a-btn-sm">
                  Rediger
                </Link>
              )}
              {settleLabel && !entry.settledAt && <SettleButton id={id} label={settleLabel} />}
            </div>
          )}
        </section>
      )}

      {takings && (
        <section className="a-card a-section">
          <h2 className="a-h2">Fra dagsoppgjør</h2>
          <p className="a-sub">
            {takings.market_days?.place_name}, {takings.market_days ? formatDate(takings.market_days.market_date) : ''}
          </p>
          <ul className="flex flex-col gap-1">
            {(siblingsRes.data ?? []).map((s) => (
              <li key={s.id}>
                {s.id === id ? (
                  <strong>{s.number}</strong>
                ) : (
                  <Link className="a-link" href={`/admin/regnskap/poster/${s.id}`}>
                    {s.number}
                  </Link>
                )}{' '}
                · {PAYMENT_LABEL[s.payment_method as keyof typeof PAYMENT_LABEL]} · {formatKr(s.amount_ore)}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="a-card a-section" aria-labelledby="receipts-title">
        <h2 id="receipts-title" className="a-h2">Kvitteringer</h2>
        {receipts.length === 0 ? (
          <p className="a-sub">Ingen kvittering ennå.</p>
        ) : (
          <ul className="r-receipts">
            {receipts.map((r) => (
              <li key={r.id}>
                <a href={`/api/receipts/${r.id}`} target="_blank" rel="noopener" className="a-link">
                  {r.mime_type.startsWith('image/') && r.mime_type !== 'image/heic' ? (
                    // eslint-disable-next-line @next/next/no-img-element -- private, authenticated route; no optimizer
                    <img src={`/api/receipts/${r.id}`} alt={`Kvittering ${r.file_name}`} />
                  ) : (
                    r.file_name
                  )}
                </a>
              </li>
            ))}
          </ul>
        )}
        {!entry.voided && <AddReceiptForm parent="entry" parentId={id} />}
      </section>

      {!entry.voided && (
        <section className="a-card a-section">
          <h2 className="a-h2">{entry.takingsId ? 'Annuller dagsoppgjør' : 'Annuller posten'}</h2>
          <p className="a-sub">Poster slettes aldri. En annullert post vises fortsatt, men telles ikke med.</p>
          <VoidForm id={entry.takingsId ?? id} takings={!!entry.takingsId} />
        </section>
      )}

      <section className="a-section" aria-labelledby="history-title">
        <h2 id="history-title" className="a-h2 px-1">Historikk</h2>
        <ul className="a-list" data-testid="entry-history">
          {history.map((h, i) => (
            <li key={i} className="flex flex-col gap-1 p-4">
              <p className="a-sub">
                {formatDateTime(h.at)} · {h.actor ? (names.get(h.actor) ?? 'Ukjent') : 'System'}
              </p>
              {h.action === 'created' ? (
                <p>Registrert</p>
              ) : (
                h.changes.map((c) => (
                  <p key={c.field}>
                    {c.field}: {c.from} → {c.to}
                  </p>
                ))
              )}
            </li>
          ))}
        </ul>
      </section>
    </Page>
  )
}
