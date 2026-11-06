'use client'

import { useEffect, useState } from 'react'
import { ActionForm, Field, inputClass } from '@/components/action-form'
import { nowOsloLocal } from '@/lib/domain/time'
import { createBatch } from '../actions'

// The batch id is generated once per form render and kept across resubmits, so a double tap
// or retry can never create a second batch.
export function NewBatchForm({ areas }: { areas: { id: string; name: string }[] }) {
  const [init, setInit] = useState<{ id: string; now: string } | null>(null)
  useEffect(() => {
    // Browser-only values (random id, local clock) must be set after hydration to avoid a mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInit({ id: crypto.randomUUID(), now: nowOsloLocal() })
  }, [])

  return (
    <ActionForm action={createBatch} disabled={!init}>
      <input type="hidden" name="id" value={init?.id ?? ''} />
      <Field label="Område">
        <select name="area_id" required defaultValue="" className={inputClass}>
          <option value="" disabled>
            Velg område
          </option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Høstet (Oslo-tid)">
        <input
          type="datetime-local"
          name="harvested_at"
          required
          max={init?.now}
          key={init?.now ?? 'pending'}
          defaultValue={init?.now ?? ''}
          className={inputClass}
        />
      </Field>
      <Field label="Plukkere">
        <input name="pickers" required className={inputClass} />
      </Field>
      <Field label="Bruttovekt (kg)">
        <input name="gross_weight" inputMode="decimal" required className={inputClass} />
      </Field>
      <Field label="Notater">
        <textarea name="notes" rows={2} className={inputClass} />
      </Field>
    </ActionForm>
  )
}
