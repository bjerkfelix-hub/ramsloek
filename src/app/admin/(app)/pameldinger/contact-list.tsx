import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/domain/time'
import { LargeTitle, Page } from '@/features/admin/ui/Page'
import { ContactControls } from './contact-controls'

export async function ContactList({ kind }: { kind: 'interest' | 'wholesale' }) {
  await requireRole('owner')
  const db = await createClient()
  // Fetch every page so the total includes registrations beyond PostgREST's row limit.
  const rows: { id: string; bags?: number; [key: string]: string | number | null | undefined }[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from(kind === 'interest' ? 'consumer_interests' : 'business_inquiries')
      .select('*')
      .order(kind === 'interest' ? 'consented_at' : 'created_at', { ascending: false })
      .order('id')
      .range(from, from + 999)
    if (error) throw error
    rows.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  const fields =
    kind === 'interest'
      ? [
          ['name', 'Navn'],
          ['email', 'E-post'],
          ['phone', 'Telefon'],
          ['bags', 'Poser'],
          ['comment', 'Kommentar'],
        ]
      : [
          ['company', 'Bedrift'],
          ['contact_name', 'Kontaktperson'],
          ['email', 'E-post'],
          ['phone', 'Telefon'],
          ['type', 'Type'],
          ['weekly_quantity', 'Ukentlig mengde'],
          ['message', 'Melding'],
          ['language', 'Språk'],
          ['consent_text', 'Samtykke'],
          ['consented_at', 'Samtykket'],
          ['answered_at', 'Besvart'],
          ['answered_by', 'Besvart av'],
        ]
  return (
    <Page>
      <LargeTitle>{kind === 'interest' ? 'Interesse' : 'Henvendelser'}</LargeTitle>
      {kind === 'interest' && (
        <p>
          Totalt antall poser:{' '}
          <strong data-testid="total-bags">{rows.reduce((sum, row) => sum + (row.bags ?? 0), 0)}</strong>
        </p>
      )}
      {!rows.length && <p className="a-sub">Ingen registreringer ennå.</p>}
      <div className="flex flex-col gap-4">
        {rows.map((row) => (
          <article key={row.id} className="a-card" data-testid="contact-row">
            <p className="a-sub">
              {formatDate(String(kind === 'interest' ? row.consented_at : row.created_at))}
            </p>
            <dl className="my-4 grid gap-2 sm:grid-cols-[10rem_1fr]">
              {fields.map(([key, label]) => (
                <div key={key} className="contents">
                  <dt className="font-semibold">{label}</dt>
                  <dd className="min-w-0 whitespace-pre-wrap break-words">
                    {row[key] == null || row[key] === '' ? '—' : String(row[key])}
                  </dd>
                </div>
              ))}
            </dl>
            <ContactControls id={row.id} kind={kind} answered={!!row.answered_at} />
          </article>
        ))}
      </div>
    </Page>
  )
}
