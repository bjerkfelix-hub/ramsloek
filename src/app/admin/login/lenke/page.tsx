'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/browser'

const TYPES: readonly string[] = ['email', 'magiclink']

export default function LinkPage() {
  return (
    <Suspense>
      <LinkConfirm />
    </Suspense>
  )
}

/**
 * Landing page for the link in the login e-mail. Signing in needs a click on the button: e-mail
 * security scanners (Microsoft 365 Safe Links) fetch every link in a message before the reader sees
 * it, and a link that signed in on load would be used up by the scanner. The token hash is not tied
 * to the browser that asked for it, so the link also works from another device or app.
 */
function LinkConfirm() {
  const params = useSearchParams()
  const tokenHash = params.get('token_hash') ?? ''
  const type = params.get('type') ?? ''
  const valid = tokenHash.length > 0 && TYPES.includes(type)
  const [status, setStatus] = useState<'idle' | 'verifying' | 'failed'>('idle')

  async function confirm() {
    setStatus('verifying')
    const { error } = await createClient().auth.verifyOtp({ token_hash: tokenHash, type: type as EmailOtpType })
    if (error) {
      setStatus('failed')
      return
    }
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a full load, so the server sees the new session cookies
    window.location.assign('/admin')
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-10">
      <div className="flex flex-col gap-1 px-1">
        <p className="a-sub font-semibold">Ramsløk</p>
        <h1 className="a-title">Logg inn</h1>
      </div>
      <div className="a-card a-form">
        {!valid || status === 'failed' ? (
          <>
            <p role="alert" className="a-msg-error">
              Lenken er ugyldig eller utløpt. Bruk koden fra e-posten, eller be om en ny.
            </p>
            <Link href="/admin/login" className="a-btn a-btn-primary">
              Til innlogging
            </Link>
          </>
        ) : (
          <>
            <p>Trykk for å logge inn på Ramsløk.</p>
            <button type="button" onClick={confirm} disabled={status === 'verifying'} className="a-btn a-btn-primary">
              {status === 'verifying' ? 'Logger inn …' : 'Logg inn'}
            </button>
          </>
        )}
      </div>
    </main>
  )
}
