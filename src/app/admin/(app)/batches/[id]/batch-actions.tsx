'use client'

import { useState, useTransition } from 'react'
import { ActionForm, buttonClass, Field, inputClass } from '@/components/action-form'
import { callAction, type ActionResult } from '@/lib/action-result'
import { logTemperature, signSortingCheck, updateBatch } from '../actions'

export const SORTING_STATEMENT = 'Sortert og kontrollert for liljekonvall og andre arter'

function Error({ result }: { result: ActionResult | null }) {
  return result && !result.ok ? (
    <p role="alert" className="text-sm text-red-700">
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
      <p className="rounded border border-zinc-300 bg-zinc-50 p-3 text-sm font-medium">{SORTING_STATEMENT}</p>
      <label className="flex items-center gap-3 text-base">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="h-6 w-6"
        />
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
    <details className="rounded border border-zinc-300 p-3">
      <summary className="cursor-pointer text-sm font-medium">Rediger</summary>
      <div className="mt-3">
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
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        const form = e.currentTarget
        const value = new FormData(form).get('celsius') as string
        start(async () => {
          const res = await callAction(() => logTemperature(batchId, value))
          setResult(res)
          if (res.ok) form.reset()
        })
      }}
    >
      <label className="flex flex-col gap-1 text-sm font-medium">
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
