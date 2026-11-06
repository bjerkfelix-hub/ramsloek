'use client'

import { Field, inputClass } from '@/components/action-form'
import { IdActionForm, REASONS } from '@/components/id-action-form'
import { packBatch, registerWaste } from '../actions'

export function PackForm({ batchId, products }: { batchId: string; products: { id: string; name: string }[] }) {
  return (
    <IdActionForm
      testId="pack-form"
      action={packBatch}
      hidden={{ batch_id: batchId }}
      submitLabel="Pakk"
    >
      <Field label="Produkt">
        <select name="product_id" required defaultValue="" className={inputClass}>
          <option value="" disabled>
            Velg produkt
          </option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Antall pakker">
        <input name="units" inputMode="numeric" required className={inputClass} />
      </Field>
    </IdActionForm>
  )
}

export function LooseWasteForm({ batchId }: { batchId: string }) {
  return (
    <IdActionForm
      testId="loose-waste-form"
      action={registerWaste}
      hidden={{ batch_id: batchId }}
      submitLabel="Registrer svinn"
    >
      <Field label="Svinn (kg)">
        <input name="weight" inputMode="decimal" required className={inputClass} />
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
