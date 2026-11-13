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

/** Supabase's answer for an address with no account while sign-ups are off. */
function isUnknownAccount(error: { code?: string; message?: string }): boolean {
  return (
    error.code === 'otp_disabled' ||
    error.code === 'signup_disabled' ||
    error.code === 'user_not_found' ||
    /signups not allowed/i.test(error.message ?? '')
  )
}

/** Digits only; Supabase sends 6 (or up to 10, depending on the project's OTP length). */
function normalizeCode(raw: string): string {
  return raw.replace(/\D/g, '')
}

function LoginForm() {
  const callbackFailed = useSearchParams().get('error') === 'callback'
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'verifying'>('idle')
  const [submitError, setError] = useState<string | null>(null)
  const error =
    submitError ??
    (callbackFailed ? 'Innloggingslenken er ugyldig eller utløpt. Be om en ny, eller bruk koden fra e-posten.' : null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('sending')
    setError(null)
    const { error } = await createClient().auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
    // An e-mail without an account must look exactly like one with an account (no user enumeration):
    // show the code step either way. Supabase refuses unknown addresses because sign-ups are off.
    if (error && isUnknownAccount(error)) {
      setStatus('sent')
      return
    }
    if (error) {
      setStatus('idle')
      const rateLimited = error.status === 429 || error.code === 'over_email_send_rate_limit'
      setError(
        rateLimited
          ? 'For mange forsøk. Vent litt og prøv igjen.'
          : 'Kunne ikke sende innloggingskode. Sjekk e-postadressen og prøv igjen.',
      )
      return
    }
    setStatus('sent')
  }

  // The code is not tied to this browser and cannot be "used up" by e-mail link scanners
  // (Microsoft 365 Safe Links opens every link in a message before the reader does).
  async function onVerify(e: React.FormEvent) {
    e.preventDefault()
    const token = normalizeCode(code)
    if (token.length < 6) {
      setError('Skriv inn hele koden fra e-posten.')
      return
    }
    setStatus('verifying')
    setError(null)
    const { error } = await createClient().auth.verifyOtp({ email: email.trim(), token, type: 'email' })
    if (error) {
      setStatus('sent')
      setError('Koden er feil eller utløpt. Sjekk at du bruker den nyeste e-posten, eller be om en ny kode.')
      return
    }
    // Full navigation, so the server reads the fresh session cookies.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a full load, so the server sees the new session cookies
    window.location.assign('/admin')
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-10">
      <div className="flex flex-col gap-1 px-1">
        <p className="a-sub font-semibold">Ramsløk</p>
        <h1 className="a-title">Logg inn</h1>
      </div>
      {status === 'sent' || status === 'verifying' ? (
        <form onSubmit={onVerify} className="a-card a-form" aria-label="Innloggingskode">
          <p role="status">
            Vi har sendt en kode til <strong>{email.trim()}</strong>.
          </p>
          <label className="a-field">
            Kode fra e-posten
            <input
              name="code"
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]*"
              maxLength={12}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="a-input"
              style={{ letterSpacing: '0.2em', fontVariantNumeric: 'tabular-nums' }}
            />
          </label>
          {error && (
            <p role="alert" className="a-msg-error">
              {error}
            </p>
          )}
          <button type="submit" disabled={status === 'verifying'} className="a-btn a-btn-primary">
            {status === 'verifying' ? 'Logger inn …' : 'Logg inn'}
          </button>
          <p className="a-sub">Du kan også trykke på lenken i e-posten.</p>
          <button
            type="button"
            className="a-btn a-btn-plain a-btn-sm self-start"
            onClick={() => {
              setStatus('idle')
              setCode('')
              setError(null)
            }}
          >
            Bruk en annen e-post eller send ny kode
          </button>
        </form>
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
          <button type="submit" disabled={status === 'sending'} className="a-btn a-btn-primary">
            Send innloggingskode
          </button>
        </form>
      )}
    </main>
  )
}
