import { getCurrentUser } from '@/lib/auth'
import { toCsv } from '@/lib/domain/csv'
import { listActiveSignups } from '@/lib/domain/signups'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const plain = (body: string, status: number) =>
  new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } })

const osloDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit' })

// The proxy redirect is only optimistic; the route checks the session and role itself.
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return plain('Ikke innlogget.', 401)
  if (user.role !== 'owner') return plain('Ikke funnet.', 404)

  let signups
  try {
    signups = await listActiveSignups()
  } catch {
    return plain('Kunne ikke hente påmeldingene.', 500)
  }
  const csv = toCsv(
    ['email', 'language', 'signed_up'],
    signups.map((s) => [s.email, s.language, osloDate.format(new Date(s.consented_at))]),
  )
  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="pameldinger.csv"',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  })
}
