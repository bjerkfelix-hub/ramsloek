import 'server-only'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/features/regnskap/fetch-all'
import { aggregateChain, type Batch, type Packing, type Movement, type Waste, type Income, type Taking, type ChainPeriod } from './chain'

// Each failure belongs to its step; never turn a failed read into a misleading zero.
async function optional<T>(read: Promise<T>): Promise<T | null> {
  try { return await read } catch { return null }
}
export async function getChain(period: ChainPeriod) {
  const user = await requireRole('owner', 'picker', 'seller')
  const client = await createClient()
  const [batches, checks, packings, movements, waste] = await Promise.all([
    optional(fetchAll<Batch>((from, to) => client.from('batches').select('gross_weight_g').gte('harvest_date', period.from).lte('harvest_date', period.to).order('id').range(from, to))),
    optional(fetchAll<{ sorting_checks: { batch_id: string }[] | { batch_id: string } | null }>((from, to) => client.from('batches').select('sorting_checks(batch_id)').gte('harvest_date', period.from).lte('harvest_date', period.to).order('id').range(from, to))),
    optional(fetchAll<Packing>((from, to) => client.from('packings').select('units, weight_g').gte('packed_at', period.start).lt('packed_at', period.end).order('id').range(from, to))),
    optional(fetchAll<Movement>((from, to) => client.from('stock_movements').select('units, kind, created_at').order('id').range(from, to))),
    optional(fetchAll<Waste>((from, to) => client.from('waste_records').select('units, weight_g').gte('created_at', period.start).lt('created_at', period.end).order('id').range(from, to))),
  ])
  const data = { batches, sorted: checks?.map(c => Array.isArray(c.sorting_checks) ? c.sorting_checks.length > 0 : !!c.sorting_checks) ?? null, packings, movements, waste }
  // This branch is server-only: no ledger/takings request is constructed for workers.
  if (user.role === 'owner') {
    const [income, takings] = await Promise.all([
      optional(fetchAll<Income>((from, to) => client.from('ledger_entries').select('amount_ore, kind, voided_at').eq('kind', 'income').is('voided_at', null).gte('entry_date', period.from).lte('entry_date', period.to).order('id').range(from, to))),
      optional(fetchAll<Taking>((from, to) => client.from('market_takings').select('market_day_id, voided_at, market_days!inner(market_date)').is('voided_at', null).gte('market_days.market_date', period.from).lte('market_days.market_date', period.to).order('id').range(from, to))),
    ])
    return aggregateChain(user.role, period, { ...data, income, takings })
  }
  return aggregateChain(user.role, period, data)
}
