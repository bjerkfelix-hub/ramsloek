'use client'

import { useState, useTransition } from 'react'
import { callAction, type ActionResult } from '@/lib/action-result'
import { useSheetClose } from '@/features/admin/ui/Sheet'
import { useToast } from '@/features/admin/ui/Toast'

export const inputClass = 'a-input'
export const buttonClass = 'a-btn a-btn-primary'

export const SAVED_TOAST = 'Lagret ✓'

// Plain form that runs a server action, keeps the user's input on errors and shows the result.
// On success it also shows the "Lagret ✓" toast and closes the sheet it sits in (if any).
export function ActionForm({
  action,
  children,
  submitLabel = 'Lagre',
  resetOnSuccess = false,
  disabled = false,
  onResult,
  testId,
  successMessage = 'Lagret.',
}: {
  action: (form: FormData) => Promise<ActionResult>
  children: React.ReactNode
  submitLabel?: string
  resetOnSuccess?: boolean
  disabled?: boolean
  onResult?: (res: ActionResult) => void
  testId?: string
  successMessage?: string
}) {
  const [result, setResult] = useState<ActionResult | null>(null)
  const [pending, startTransition] = useTransition()
  const toast = useToast()
  const closeSheet = useSheetClose()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const data = new FormData(form)
    startTransition(async () => {
      const res = await callAction(() => action(data), `Ingen forbindelse – trykk ${submitLabel} igjen.`)
      setResult(res)
      onResult?.(res)
      if (res.ok) {
        toast.show(SAVED_TOAST)
        if (resetOnSuccess) form.reset()
        closeSheet?.()
      }
    })
  }

  return (
    <form onSubmit={onSubmit} data-testid={testId} className="a-form">
      {children}
      {result && !result.ok && (
        <p role="alert" className="a-msg-error">
          {result.error}
        </p>
      )}
      {result?.ok && (
        <p role="status" className="a-msg-ok">
          {successMessage}
        </p>
      )}
      <button type="submit" disabled={pending || disabled} className={buttonClass}>
        {submitLabel}
      </button>
    </form>
  )
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="a-field">
      {label}
      {children}
    </label>
  )
}
