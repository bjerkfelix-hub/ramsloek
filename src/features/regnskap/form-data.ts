import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type { LedgerKind } from '@/lib/domain/ledger'
import type { CategoryOption } from './EntryForm'
import type { TakingsDay } from './TakingsForm'

const weekdayFmt = new Intl.DateTimeFormat('nb-NO', { weekday: 'long', day: '2-digit', month: '2-digit', timeZone: 'UTC' })

/** Active categories of one kind, in the owner's chosen order. */
export async function activeCategories(kind: LedgerKind): Promise<CategoryOption[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('ledger_categories')
    .select('id, name, account_no')
    .eq('kind', kind)
    .eq('active', true)
    .order('sort')
    .order('name')
  if (error) throw error
  return (data ?? []).map((c) => ({ id: c.id, name: c.name, accountNo: c.account_no }))
}

/** Market days the caller can register takings for (see takings_market_days() in the database). */
export async function takingsDays(): Promise<TakingsDay[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('takings_market_days')
  if (error) throw error
  return ((data ?? []) as { id: string; market_date: string; place_name: string }[]).map((d) => {
    const label = weekdayFmt.format(new Date(`${d.market_date}T00:00:00Z`))
    return { id: d.id, label: `${label.charAt(0).toUpperCase()}${label.slice(1)} – ${d.place_name}` }
  })
}

/** YYYY-MM-DD plus n days. */
export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
