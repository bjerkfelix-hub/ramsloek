'use client'

import { useState, useTransition } from 'react'
import type { ActionResult } from '@/lib/action-result'

export const inputClass = 'rounded border border-zinc-400 px-3 py-3 text-base'
export const buttonClass = 'rounded bg-green-800 px-4 py-3 text-base font-medium text-white disabled:opacity-60'

// Plain form that runs a server action, keeps the user's input on errors and shows the result.
export function ActionForm({
  action,
  children,
  submitLabel = 'Lagre',
  resetOnSuccess = false,
}: {
  action: (form: FormData) => Promise<ActionResult>
  children: React.ReactNode
  submitLabel?: string
  resetOnSuccess?: boolean
}) {
  const [result, setResult] = useState<ActionResult | null>(null)
  const [pending, startTransition] = useTransition()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const data = new FormData(form)
    startTransition(async () => {
      const res = await action(data)
      setResult(res)
      if (res.ok && resetOnSuccess) form.reset()
    })
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      {children}
      {result && !result.ok && (
        <p role="alert" className="text-sm text-red-700">
          {result.error}
        </p>
      )}
      {result?.ok && (
        <p role="status" className="text-sm text-green-800">
          Lagret.
        </p>
      )}
      <button type="submit" disabled={pending} className={buttonClass}>
        {submitLabel}
      </button>
    </form>
  )
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium">
      {label}
      {children}
    </label>
  )
}
