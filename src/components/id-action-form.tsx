'use client'

import { useEffect, useState } from 'react'
import { ActionForm } from '@/components/action-form'
import type { ActionResult } from '@/lib/action-result'

export const REASONS = [
  { value: 'visnet', label: 'Visnet' },
  { value: 'skadet', label: 'Skadet' },
  { value: 'utgått', label: 'Utgått' },
  { value: 'annet', label: 'Annet' },
]

// The record id is generated once and kept across resubmits (double tap, retry after an error);
// only a successful save rotates it, so each real submission maps to exactly one row.
export function IdActionForm({
  action,
  hidden,
  children,
  submitLabel,
  testId,
}: {
  action: (form: FormData) => Promise<ActionResult>
  hidden: Record<string, string>
  children: React.ReactNode
  submitLabel: string
  testId?: string
}) {
  const [id, setId] = useState<string | null>(null)
  useEffect(() => {
    // Browser-only value; set after hydration to avoid a mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setId(crypto.randomUUID())
  }, [])
  return (
    <ActionForm
      action={action}
      submitLabel={submitLabel}
      disabled={!id}
      resetOnSuccess
      testId={testId}
      onResult={(res) => {
        if (res.ok) setId(crypto.randomUUID())
      }}
    >
      <input type="hidden" name="id" value={id ?? ''} />
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {children}
    </ActionForm>
  )
}
