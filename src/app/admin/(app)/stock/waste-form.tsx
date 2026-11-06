'use client'

import { Field, inputClass } from '@/components/action-form'
import { IdActionForm, REASONS } from '@/components/id-action-form'
import { registerWaste } from './actions'

export function StockWasteForm({ batchId, productId }: { batchId: string; productId: string }) {
  return (
    <IdActionForm
      action={registerWaste}
      hidden={{ batch_id: batchId, product_id: productId }}
      submitLabel="Registrer svinn"
    >
      <Field label="Antall svinn">
        <input name="units" inputMode="numeric" required className={inputClass} />
      </Field>
      <Field label="Årsak">
        <select name="reason" required defaultValue="visnet" className={inputClass}>
          {REASONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Notat">
        <input name="note" className={inputClass} />
      </Field>
    </IdActionForm>
  )
}
