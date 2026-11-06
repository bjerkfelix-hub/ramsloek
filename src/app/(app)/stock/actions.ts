'use server'

import type { ActionResult } from '@/lib/action-result'
import { registerWaste as registerBatchWaste } from '../batches/actions'

// Waste of whole units from the stock page; same validation and idempotency as the batch page.
export async function registerWaste(form: FormData): Promise<ActionResult> {
  return registerBatchWaste(form)
}
