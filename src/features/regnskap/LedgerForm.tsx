'use client'

import { useEffect, useState, useTransition } from 'react'
import { callAction, type ActionResult } from '@/lib/action-result'
import { useToast } from '@/features/admin/ui/Toast'
import { SAVED_TOAST } from '@/components/action-form'
import { uploadReceipt } from '@/app/admin/(app)/regnskap/receipt-actions'

export type SaveResult = ActionResult & { entryId?: string; number?: string; takingsId?: string; numbers?: string[] }

type Outcome =
  | { kind: 'error'; text: string }
  | { kind: 'saved'; text: string }
  | { kind: 'upload-failed'; text: string; label: string; parent: 'entry' | 'takings'; parentId: string; file: File }

function hasFile(v: FormDataEntryValue | null): v is File {
  return v instanceof File && v.size > 0
}

/**
 * Saves a ledger record, then uploads its receipt (if one was chosen). The record is saved first so
 * a failed upload never loses the figures; the user can retry just the upload. A fresh client key per
 * round makes a double tap or a retried save idempotent. On success the form is cleared for the next
 * registration while the confirmation stays visible.
 */
export function LedgerForm({
  save,
  parent,
  submitLabel = 'Lagre',
  children,
  testId,
  onSaved,
}: {
  onSaved?: () => void
  save: (form: FormData) => Promise<SaveResult>
  parent: 'entry' | 'takings'
  submitLabel?: string
  children: React.ReactNode
  testId?: string
}) {
  const [round, setRound] = useState(0)
  const [clientKey, setClientKey] = useState('')
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [pending, startTransition] = useTransition()
  const toast = useToast()

  useEffect(() => {
    // Browser-only random value, set after hydration (and again for each new round).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setClientKey(crypto.randomUUID())
  }, [round])

  async function upload(parentId: string, file: File): Promise<ActionResult> {
    const data = new FormData()
    data.set('parent', parent)
    data.set('parent_id', parentId)
    data.set('file', file)
    return callAction(() => uploadReceipt(data), 'Ingen forbindelse.')
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    const file = data.get('file')
    data.delete('file')
    startTransition(async () => {
      const res = await callAction(() => save(data), `Ingen forbindelse – trykk ${submitLabel} igjen.`)
      if (!res.ok) {
        setOutcome({ kind: 'error', text: res.error })
        return
      }
      const saved = res as SaveResult & { ok: true }
      const parentId = saved.entryId ?? saved.takingsId ?? ''
      const label = saved.number ?? (saved.numbers ?? []).join(', ')
      if (hasFile(file)) {
        const up = await upload(parentId, file)
        if (!up.ok) {
          setOutcome({
            kind: 'upload-failed',
            text: `Posten er lagret som ${label}, men kvitteringen ble ikke lastet opp. ${up.error}`,
            label,
            parent,
            parentId,
            file,
          })
          setRound((r) => r + 1)
          onSaved?.()
          return
        }
      }
      toast.show(SAVED_TOAST)
      setOutcome({ kind: 'saved', text: `Registrert som ${label}` })
      setRound((r) => r + 1)
      onSaved?.()
    })
  }

  function retryUpload() {
    if (outcome?.kind !== 'upload-failed') return
    const { parentId, file, label } = outcome
    startTransition(async () => {
      const up = await upload(parentId, file)
      if (up.ok) {
        toast.show(SAVED_TOAST)
        setOutcome({ kind: 'saved', text: `Registrert som ${label}` })
      } else {
        setOutcome({ ...outcome, text: `Posten er lagret som ${label}, men kvitteringen ble ikke lastet opp. ${up.error}` })
      }
    })
  }

  return (
    <div className="a-form">
      {outcome?.kind === 'saved' && (
        <p role="status" className="a-msg-ok" data-testid="ledger-saved">
          {outcome.text}
        </p>
      )}
      {outcome?.kind === 'upload-failed' && (
        <div role="alert" className="a-note a-note-warn flex flex-col gap-2">
          <p>{outcome.text}</p>
          <button type="button" className="a-btn a-btn-tinted a-btn-sm self-start" onClick={retryUpload} disabled={pending}>
            Prøv igjen
          </button>
        </div>
      )}
      <form key={round} onSubmit={onSubmit} data-testid={testId} className="a-form" aria-busy={pending}>
        <input type="hidden" name="client_key" value={clientKey} />
        {children}
        {outcome?.kind === 'error' && (
          <p role="alert" className="a-msg-error">
            {outcome.text}
          </p>
        )}
        <button type="submit" disabled={pending || !clientKey} className="a-btn a-btn-primary">
          {pending ? 'Lagrer …' : submitLabel}
        </button>
      </form>
    </div>
  )
}
