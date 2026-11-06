'use client'

import { useState, useTransition } from 'react'
import { callAction, type ActionResult } from '@/lib/action-result'

export function MarketCancelButton({
  id,
  cancelled,
  action,
}: {
  id: string
  cancelled: boolean
  action: (id: string, cancelled: boolean) => Promise<ActionResult>
}) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await callAction(() => action(id, !cancelled))
            setError(res.ok ? null : res.error)
          })
        }
        className="rounded border border-zinc-500 px-3 py-2 text-sm disabled:opacity-60"
      >
        {cancelled ? 'Gjenopprett' : 'Avlys'}
      </button>
      {error && (
        <span role="alert" className="ml-2 text-sm text-red-700">
          {error}
        </span>
      )}
    </>
  )
}
