'use client'

import { useState, useTransition } from 'react'
import { callAction, type ActionResult } from '@/lib/action-result'

export function UserActiveButton({
  userId,
  active,
  action,
}: {
  userId: string
  active: boolean
  action: (userId: string, active: boolean) => Promise<ActionResult>
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
            const res = await callAction(() => action(userId, !active))
            setError(res.ok ? null : res.error)
          })
        }
        className="a-btn a-btn-gray a-btn-sm"
      >
        {active ? 'Deaktiver' : 'Aktiver'}
      </button>
      {error && (
        <span role="alert" className="a-msg-error ml-2">
          {error}
        </span>
      )}
    </>
  )
}
