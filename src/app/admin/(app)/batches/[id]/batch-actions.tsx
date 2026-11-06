'use client'

import { useState, useTransition } from 'react'
import { ActionForm, buttonClass, Field, inputClass, SAVED_TOAST } from '@/components/action-form'
import { useToast } from '@/features/admin/ui/Toast'
import { callAction, type ActionResult } from '@/lib/action-result'
import { logTemperature, signSortingCheck, updateBatch } from '../actions'

export const SORTING_STATEMENT = 'Sortert og kontrollert for liljekonvall og andre arter'

function Error({ result }: { result: ActionResult | null }) {
  return result && !result.ok ? (
    <p role="alert" className="a-msg-error">
      {result.error}
    </p>
  ) : null
}

export function SignButton({ batchId }: { batchId: string }) {
  const [pending, start] = useTransition()
  const [result, setResult] = useState<ActionResult | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  return (
    <div className="flex flex-col gap-3">
      <p className="a-note a-note-plain">{SORTING_STATEMENT}</p>
      <label className="a-check">
        <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
        Jeg bekrefter dette
      </label>
      <button
        type="button"
        disabled={pending || !confirmed}
        className={buttonClass}
        onClick={() => start(async () => setResult(await callAction(() => signSortingCheck(batchId))))}
      >
        Signer sorteringskontroll
      </button>
      <Error result={result} />
    </div>
  )
}

export function EditBatchForm({
  batchId,
  grossKg,
  notes,
}: {
  batchId: string
  grossKg: string
  notes: string
}) {
  return (
    <details className="a-details">
      <summary>Rediger</summary>
      <div className="a-card mt-2">
        <ActionForm action={updateBatch} testId="edit-batch-form">
          <input type="hidden" name="batch_id" value={batchId} />
          <Field label="Bruttovekt (kg)">
            <input name="gross_weight" inputMode="decimal" required defaultValue={grossKg} className={inputClass} />
          </Field>
          <Field label="Notater">
            <textarea name="notes" rows={2} defaultValue={notes} className={inputClass} />
          </Field>
        </ActionForm>
      </div>
    </details>
  )
}

export function TemperatureForm({ batchId }: { batchId: string }) {
  const [pending, start] = useTransition()
  const [result, setResult] = useState<ActionResult | null>(null)
  const toast = useToast()
  return (
    <form
      className="a-form"
      onSubmit={(e) => {
        e.preventDefault()
        const form = e.currentTarget
        const value = new FormData(form).get('celsius') as string
        start(async () => {
          const res = await callAction(() => logTemperature(batchId, value))
          setResult(res)
          if (res.ok) {
            form.reset()
            toast.show(SAVED_TOAST)
          }
        })
      }}
    >
      <label className="a-field">
        Temperatur (°C)
        <input name="celsius" inputMode="decimal" required className={inputClass} />
      </label>
      <Error result={result} />
      <button type="submit" disabled={pending} className={buttonClass}>
        Logg temperatur
      </button>
    </form>
  )
}
