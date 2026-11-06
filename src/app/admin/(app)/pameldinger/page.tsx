import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/domain/time'
import { listActiveSignups } from '@/lib/domain/signups'
import { LargeTitle, Page } from '@/features/admin/ui/Page'

export default async function SignupsPage() {
  await requireRole('owner')
  // Housekeeping: deletes sign-ups unsubscribed more than 30 days ago (owner-only function).
  const supabase = await createClient()
  const { error: purgeError } = await supabase.rpc('purge_unsubscribed_signups')
  if (purgeError) console.error('purge_unsubscribed_signups failed', purgeError)
  const signups = await listActiveSignups()

  return (
    <Page>
      <LargeTitle>Påmeldinger</LargeTitle>
      <div className="flex flex-wrap items-center justify-between gap-3">
      <p data-testid="signup-count">
        Aktive påmeldinger: <strong>{signups.length}</strong>
      </p>
      <p>
        <a href="/admin/pameldinger/export" className="a-btn a-btn-tinted a-btn-sm">
          Last ned CSV
        </a>
      </p>
      </div>
      {signups.length === 0 ? (
        <p className="a-sub">Ingen påmeldinger ennå.</p>
      ) : (
        <div className="a-table-wrap">
          <table className="a-table">
            <thead>
              <tr>
                <th>E-post</th>
                <th>Språk</th>
                <th>Påmeldt</th>
              </tr>
            </thead>
            <tbody>
              {signups.map((s) => (
                <tr key={s.email}>
                  <td className="break-all">{s.email}</td>
                  <td>{s.language === 'en' ? 'Engelsk' : 'Norsk'}</td>
                  <td>{formatDate(s.consented_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Page>
  )
}
