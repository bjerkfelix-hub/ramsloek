import { getCurrentUser } from '@/lib/auth'
import { parseMonth } from '@/lib/domain/planning'
import { loadHoursExport } from '@/features/planlegging/export-data'
import { buildHoursWorkbook } from '@/features/planlegging/xlsx'
import { downloadHeaders } from '@/features/regnskap/export-route'
export const runtime = 'nodejs'
export async function GET(request: Request) {
  const user = await getCurrentUser()
  const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }
  if (!user || user.role !== 'owner') return new Response('Fant ikke siden.', { status: 404, headers })
  const month = new URL(request.url).searchParams.get('month')
  if (!parseMonth(month)) return new Response('Velg en gyldig måned.', { status: 400, headers })
  const data = await loadHoursExport(month!)
  const bytes = await buildHoursWorkbook(data)
  return new Response(bytes as BodyInit, { headers: downloadHeaders(`ramslok-timer-${month}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') })
}
