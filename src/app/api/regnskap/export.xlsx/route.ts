import { loadExport } from '@/features/regnskap/export-data'
import { downloadHeaders, exportGate } from '@/features/regnskap/export-route'
import { buildWorkbook } from '@/features/regnskap/xlsx'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const gate = await exportGate(request)
  if (gate instanceof Response) return gate
  const { period } = gate
  const { entries } = await loadExport(period)
  const bytes = await buildWorkbook(entries, period)
  return new Response(bytes as BodyInit, {
    headers: downloadHeaders(
      `ramslok-regnskap-${period.from}-${period.to}.xlsx`,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ),
  })
}
