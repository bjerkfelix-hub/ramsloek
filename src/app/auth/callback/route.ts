import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Completes magic-link sign-in: PKCE code (browser-initiated links) or token hash (admin-generated links).
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const supabase = await createClient()

  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type')

  let error: unknown = new Error('missing code')
  if (code) {
    error = (await supabase.auth.exchangeCodeForSession(code)).error
  } else if (tokenHash && type) {
    error = (await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as 'magiclink' | 'email' })).error
  }

  if (error) return NextResponse.redirect(`${origin}/login?error=callback`)
  return NextResponse.redirect(`${origin}/`)
}
