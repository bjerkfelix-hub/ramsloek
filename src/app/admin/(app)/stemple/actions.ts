'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { dbErrorToMessage } from '@/lib/errors'
import type { ActionResult } from '@/lib/action-result'
import type { ClockEntry } from '@/features/planlegging/queries'

const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
async function clock(name: 'clock_in' | 'clock_out', id: string): Promise<ActionResult & { entry?: ClockEntry }> {
  await requireRole('owner', 'picker', 'seller')
  if (!UUID.test(id)) return { ok: false, error: dbErrorToMessage({ message: 'PLANNING_NOT_FOUND' }) }
  const client = await createClient()
  const { data, error } = await client.rpc(name, name === 'clock_in' ? { p_start_key: id } : { p_entry_id: id })
  if (error) return { ok: false, error: dbErrorToMessage(error) }
  revalidatePath('/admin')
  revalidatePath('/admin/stemple')
  revalidatePath('/admin/timer', 'layout')
  // Restrict the response to the state rendered by the clock.
  const { id: entryId, version, started_at, ended_at, shift_id, hourly_rate_ore, start_key } = data
  return { ok: true, entry: { id: entryId, version, started_at, ended_at, shift_id, hourly_rate_ore, start_key } }
}
export async function startClock(startKey: string): Promise<ActionResult & { entry?: ClockEntry }> {
  return clock('clock_in', startKey)
}
export async function stopClock(entryId: string): Promise<ActionResult & { entry?: ClockEntry }> {
  return clock('clock_out', entryId)
}
