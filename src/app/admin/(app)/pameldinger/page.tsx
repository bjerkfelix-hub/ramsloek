import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/domain/time'
import { listActiveSignups } from '@/lib/domain/signups'

export default async function SignupsPage() {
  await requireRole('owner')
  // Housekeeping: deletes sign-ups unsubscribed more than 30 days ago (owner-only function).
  const supabase = await createClient()
  await supabase.rpc('purge_unsubscribed_signups')
  const signups = await listActiveSignups()

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Påmeldinger</h1>
      <p data-testid="signup-count">
        Aktive påmeldinger: <strong>{signups.length}</strong>
      </p>
      <p>
        <a href="/admin/pameldinger/export" className="inline-block py-2 text-green-900 underline">
          Last ned CSV
        </a>
      </p>
      {signups.length === 0 ? (
        <p className="text-zinc-600">Ingen påmeldinger ennå.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-300">
                <th className="py-2 pr-4">E-post</th>
                <th className="py-2 pr-4">Språk</th>
                <th className="py-2">Påmeldt</th>
              </tr>
            </thead>
            <tbody>
              {signups.map((s) => (
                <tr key={s.email} className="border-b border-zinc-200">
                  <td className="py-2 pr-4 break-all">{s.email}</td>
                  <td className="py-2 pr-4">{s.language === 'en' ? 'Engelsk' : 'Norsk'}</td>
                  <td className="py-2">{formatDate(s.consented_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
