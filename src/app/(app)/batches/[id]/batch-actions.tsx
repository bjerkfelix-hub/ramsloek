'use client'

import { useState, useTransition } from 'react'
import { buttonClass, inputClass } from '@/components/action-form'
import type { ActionResult } from '@/lib/action-result'
import { logTemperature, signSortingCheck } from '../actions'

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
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={pending}
        className={buttonClass}
        onClick={() => start(async () => setResult(await signSortingCheck(batchId)))}
      >
        Signer sorteringskontroll
      </button>
      <Error result={result} />
    </div>
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
          const res = await logTemperature(batchId, value)
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
