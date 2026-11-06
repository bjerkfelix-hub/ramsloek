import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { MarketDay } from '@/lib/domain/season'
import { todayOslo } from '@/lib/domain/time'
import { supabaseEnv } from '@/lib/supabase/env'

export type MarketDaysResult = { ok: true; days: MarketDay[] } | { ok: false }

type Reader = Pick<SupabaseClient, 'from'>

type Row = {
  id: string
  market_date: string
  starts_at: string
  ends_at: string
  place_name: string
  address: string
  note_no: string | null
  note_en: string | null
  cancelled: boolean
}

// Public pages must not hang on a slow database: give up after this long.
export const FETCH_TIMEOUT_MS = 3000

export function timeoutFetch(timeoutMs = FETCH_TIMEOUT_MS, base: typeof fetch = (...a) => fetch(...a)): typeof fetch {
  return (input, init) => {
    const signal = AbortSignal.timeout(timeoutMs)
    return base(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, signal]) : signal })
  }
}

const COLUMNS = 'id, market_date, starts_at, ends_at, place_name, address, note_no, note_en, cancelled'

// Anonymous, cookie-less client: public pages never read or write the visitor's auth cookies.
// Env is read here, at request time, so builds work without Supabase configured.
function anonClient(): Reader {
  const { url, anonKey } = supabaseEnv()
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: timeoutFetch() },
  })
}

function toMarketDay(r: Row): MarketDay {
  return {
    id: r.id,
    marketDate: r.market_date,
    startsAt: r.starts_at.slice(0, 5),
    endsAt: r.ends_at.slice(0, 5),
    placeName: r.place_name,
    address: r.address,
    noteNo: r.note_no,
    noteEn: r.note_en,
    cancelled: r.cancelled,
  }
}

/**
 * Upcoming published market days (today in Oslo onwards, cancelled ones included), ordered by date
 * and start time. Never throws: any failure becomes `{ ok: false }` so public pages still render.
 */
export async function getUpcomingMarketDays(limit?: number, client?: Reader): Promise<MarketDaysResult> {
  try {
    const db = client ?? anonClient()
    let query = db
      .from('market_days')
      .select(COLUMNS)
      .eq('published', true)
      .gte('market_date', todayOslo())
      .order('market_date')
      .order('starts_at')
    if (limit !== undefined) query = query.limit(limit)
    const { data, error } = await query
    if (error || !data) {
      console.error('Could not load market days:', error?.message ?? 'no data')
      return { ok: false }
    }
    return { ok: true, days: (data as Row[]).map(toMarketDay) }
  } catch (e) {
    console.error('Could not load market days:', e instanceof Error ? e.message : e)
    return { ok: false }
  }
}
