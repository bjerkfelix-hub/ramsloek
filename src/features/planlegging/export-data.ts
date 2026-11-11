import 'server-only'
import { requireRole } from '@/lib/auth'
import { parseMonth, summarizePlanning, type PlanningSegment } from '@/lib/domain/planning'
import { getHours, type HoursOpenEntry } from './queries'

export type HoursExportData = {
  month: string; rows: (PlanningSegment & { personName: string })[]
  knownAmountOre: number; missingRateCount: number; openEntries: HoursOpenEntry[]
}
export async function loadHoursExport(month: string): Promise<HoursExportData> {
  await requireRole('owner')
  const period = parseMonth(month)
  if (!period) throw Error('Velg en gyldig måned.')
  const data = await getHours(period)
  const rows = data.segments.filter(s => s.sourceKind === 'time').map(s => ({ ...s, personName: data.people.find(p => p.id === s.profileId)?.full_name ?? 'Ukjent' }))
  const summary = summarizePlanning(rows)
  return { month, rows, knownAmountOre: summary.workedAmountOre, missingRateCount: summary.missingWorkedRateCount, openEntries: data.openEntries }
}
