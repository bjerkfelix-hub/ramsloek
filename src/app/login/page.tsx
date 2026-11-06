'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/browser'

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}

function LoginForm() {
  const callbackFailed = useSearchParams().get('error') === 'callback'
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [submitError, setError] = useState<string | null>(null)
  const error = submitError ?? (callbackFailed ? 'Innloggingslenken er ugyldig eller utløpt. Be om en ny.' : null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('sending')
    setError(null)
    const { error } = await createClient().auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) {
      setStatus('idle')
      setError('Kunne ikke sende innloggingslenke. Sjekk e-postadressen og prøv igjen.')
      return
    }
    setStatus('sent')
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">Logg inn</h1>
      {status === 'sent' ? (
        <p role="status">Sjekk e-posten din. Vi har sendt deg en innloggingslenke.</p>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium">
            E-post
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded border border-zinc-400 px-3 py-3 text-base"
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={status === 'sending'}
            className="rounded bg-green-800 px-4 py-3 text-base font-medium text-white disabled:opacity-60"
          >
            Send innloggingslenke
          </button>
        </form>
      )}
    </main>
  )
}
