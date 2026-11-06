import type { EmailOtpType } from '@supabase/supabase-js'
import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const OTP_TYPES: readonly string[] = ['magiclink', 'email']

// Completes magic-link sign-in: PKCE code (browser-initiated links) or token hash (admin-generated links).
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const supabase = await createClient()

  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type')

  let error: unknown = new Error('missing code')
  if (code) {
    error = (await supabase.auth.exchangeCodeForSession(code)).error
  } else if (tokenHash && type && OTP_TYPES.includes(type)) {
    error = (await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as EmailOtpType })).error
  }

  // Relative Location: behind a proxy (Railway) request.nextUrl.origin is localhost:<PORT>, not the public host.
  // The session cookies set by the server client are merged into this response by Next.
  return redirectTo(error ? '/admin/login?error=callback' : '/admin')
}

function redirectTo(location: string) {
  return new NextResponse(null, { status: 303, headers: { Location: location } })
}
