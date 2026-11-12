import type { Role } from '@/lib/auth'
import { osloLocalToIso, todayOslo } from '@/lib/domain/time'

export const PERIODS = { sesong: 'Sesong', uke: '7 dager', dag: 'I dag' } as const
export type ChainPeriod = ReturnType<typeof chainPeriod>
function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}
export function chainPeriod(input: string | string[] | undefined, now: Date) {
  const key = input === 'uke' || input === 'dag' ? input : 'sesong'
  const to = todayOslo(now)
  const from = key === 'sesong' ? `${to.slice(0, 4)}-01-01` : key === 'uke' ? addDays(to, -6) : to
  return { key, from, to, start: osloLocalToIso(`${from}T00:00`)!, end: osloLocalToIso(`${addDays(to, 1)}T00:00`)! }
}
export type Batch = { gross_weight_g: number }
export type Packing = { units: number; weight_g: number }
export type Movement = { units: number; kind: string; created_at: string }
export type Waste = { units: number | null; weight_g: number | null }
export type Income = { amount_ore: number; kind: string; voided_at: string | null }
export type Taking = { market_day_id: string; voided_at: string | null }
export type Metric = { label: string; value: number; unit: string; digits?: number }
export type Step = { id: string; title: string; href: string; metrics: Metric[]; failed?: boolean }
export type ChainData = { batches: Batch[] | null; sorted: boolean[] | null; packings: Packing[] | null; movements: Movement[] | null; waste: Waste[] | null; income?: Income[] | null; takings?: Taking[] | null }
const sum = <T,>(rows: T[], value: (row: T) => number) => rows.reduce((total, row) => total + value(row), 0)
export function aggregateChain(role: Role, period: ChainPeriod, data: ChainData): Step[] {
  const { batches, sorted, packings, movements, waste } = data
  const metric = (label: string, value: number, unit: string, digits = 0): Metric => ({ label, value, unit, digits })
  const out = movements?.filter(m => Date.parse(m.created_at) >= Date.parse(period.start) && Date.parse(m.created_at) < Date.parse(period.end) && ['sell', 'deliver'].includes(m.kind)) ?? []
  const steps: Step[] = [
    { id: 'picking', title: 'Plukking', href: '/admin/batches', failed: batches === null, metrics: [metric('plukket', sum(batches ?? [], b => b.gross_weight_g) / 1000, 'kg', 1), metric('partier', batches?.length ?? 0, '')] },
    { id: 'sorting', title: 'Vasking og sortering', href: '/admin/batches', failed: sorted === null, metrics: [metric('kontrollert', sorted?.filter(Boolean).length ?? 0, 'partier'), metric('avventer kontroll', sorted?.filter(s => !s).length ?? 0, 'venter')] },
    { id: 'packing', title: 'Pakking', href: '/admin/stock', failed: packings === null, metrics: [metric('pakket', sum(packings ?? [], p => p.units), 'stk'), metric('pakket', sum(packings ?? [], p => p.weight_g) / 1000, 'kg', 1)] },
    { id: 'delivery', title: 'Levering', href: '/admin/stock', failed: movements === null || waste === null, metrics: [metric('levert / solgt', sum(out, m => -m.units), 'stk'), metric('på lager nå', sum(movements ?? [], m => m.units), 'stk'), metric('svinn', sum(waste ?? [], w => w.units ?? 0), 'stk'), metric('svinn i løs vekt', sum(waste ?? [], w => w.weight_g ?? 0) / 1000, 'kg', 1)] },
  ]
  // Workers never receive a value step, even if data were accidentally supplied.
  if (role === 'owner') {
    const income = sum((data.income ?? []).filter(e => e.kind === 'income' && e.voided_at === null), e => e.amount_ore) / 100
    const days = new Set((data.takings ?? []).filter(t => t.voided_at === null).map(t => t.market_day_id)).size
    steps.push({ id: 'value', title: 'Verdi', href: '/admin/regnskap', failed: data.income == null || data.takings == null, metrics: [metric('inntekt', income, 'kr'), metric('per markedsdag med oppgjør', days ? income / days : 0, 'kr')] })
  }
  return steps
}
export function formatChainNumber(value: number, digits = 0) {
  return new Intl.NumberFormat('nb-NO', { maximumFractionDigits: digits }).format(value).replace(/\u00a0/g, ' ')
}
