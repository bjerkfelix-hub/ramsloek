import 'server-only'
import { getCurrentUser } from '@/lib/auth'
import { parsePeriod, type Period } from '@/lib/domain/periods'

const NO_STORE = { 'Cache-Control': 'private, no-store' }

/** Shared gate for export routes: owner only (404 otherwise), and a valid period (400 otherwise). */
export async function exportGate(request: Request): Promise<{ period: Period } | Response> {
  const user = await getCurrentUser()
  if (!user || user.role !== 'owner') return new Response('Fant ikke siden.', { status: 404, headers: NO_STORE })
  const url = new URL(request.url)
  const period = parsePeriod(url.searchParams.get('from'), url.searchParams.get('to'))
  if (!period) return new Response('Ugyldig periode.', { status: 400, headers: NO_STORE })
  return { period }
}

export function downloadHeaders(fileName: string, contentType: string): HeadersInit {
  return {
    'Content-Type': contentType,
    'Content-Disposition': `attachment; filename="${fileName}"`,
    'X-Content-Type-Options': 'nosniff',
    ...NO_STORE,
  }
}
