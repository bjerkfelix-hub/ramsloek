import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Completes browser-initiated PKCE sign-in; legacy token-hash links require explicit confirmation.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl

  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type')

  if (!code && tokenHash !== null) {
    const params = new URLSearchParams({ token_hash: tokenHash })
    if (type !== null) params.set('type', type)
    return redirectTo(`/admin/login/lenke?${params}`)
  }

  const supabase = await createClient()
  let error: unknown = new Error('missing code')
  if (code) {
    error = (await supabase.auth.exchangeCodeForSession(code)).error
  }

  // Relative Location: behind a proxy (Railway) request.nextUrl.origin is localhost:<PORT>, not the public host.
  // The session cookies set by the server client are merged into this response by Next.
  return redirectTo(error ? '/admin/login?error=callback' : '/admin')
}

function redirectTo(location: string) {
  return new NextResponse(null, { status: 303, headers: { Location: location } })
}
