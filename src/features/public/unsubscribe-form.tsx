'use client'

import { useActionState } from 'react'
import { unsubscribeAction } from '@/app/(public)/unsubscribe-actions'
import type { Dictionary } from '@/content'

export function UnsubscribeForm({ token, dict }: { token: string; dict: Dictionary['unsubscribe'] }) {
  const [state, formAction, pending] = useActionState(unsubscribeAction, null)
  if (state?.status === 'done') return <p className="max-w-[60ch] text-lg" data-testid="unsubscribe-message">{dict.done}</p>
  if (state?.status === 'invalid') return <p className="max-w-[60ch] text-lg" data-testid="unsubscribe-message">{dict.invalid}</p>
  return (
    <form action={formAction} className="flex flex-col items-start gap-3">
      <input type="hidden" name="token" value={token} />
      {state?.status === 'error' && (
        <p role="alert" className="font-medium text-alert" data-testid="unsubscribe-message">
          {dict.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-forest px-5 py-3 font-medium text-cream hover:bg-forest-dark disabled:opacity-60"
      >
        {dict.button}
      </button>
    </form>
  )
}
