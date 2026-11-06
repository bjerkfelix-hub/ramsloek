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
  const error = submitError ?? (callbackFailed ? 'Innloggingslenken er ugyldig eller utløpt. Be om en ny, og åpne den på samme enhet og i samme nettleser.' : null)

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
      const rateLimited = error.status === 429 || error.code === 'over_email_send_rate_limit'
      setError(
        rateLimited
          ? 'For mange forsøk. Vent litt og prøv igjen.'
          : 'Kunne ikke sende innloggingslenke. Sjekk e-postadressen og prøv igjen.',
      )
      return
    }
    setStatus('sent')
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-10">
      <div className="flex flex-col gap-1 px-1">
        <p className="a-sub font-semibold">Ramsløk</p>
        <h1 className="a-title">Logg inn</h1>
      </div>
      {status === 'sent' ? (
        <div role="status" className="a-card flex flex-col gap-2">
          <p>Sjekk e-posten din. Vi har sendt deg en innloggingslenke.</p>
          <p className="a-sub">Åpne lenken på samme enhet og i samme nettleser som du ba om den fra.</p>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="a-card a-form">
          <label className="a-field">
            E-post
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="a-input"
            />
          </label>
          {error && (
            <p role="alert" className="a-msg-error">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={status === 'sending'}
            className="a-btn a-btn-primary"
          >
            Send innloggingslenke
          </button>
        </form>
      )}
    </main>
  )
}
