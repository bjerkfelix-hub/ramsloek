import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Refreshes the Supabase session cookies and sends signed-out visitors on /admin to /admin/login.
// The public site is not matched; only /admin and /api/labels run through here.
// This is an optimistic check only; pages re-verify via requireRole().
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    return new NextResponse('Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.', {
      status: 500,
    })
  }

  let response = NextResponse.next({ request })
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })

  const { data } = await supabase.auth.getClaims()
  const { pathname } = request.nextUrl
  // The label route answers 401 itself instead of redirecting to the login page.
  // /admin/login/lenke is where the login e-mail's link lands (signed out by definition).
  const isPublic =
    pathname === '/admin/login' || pathname === '/admin/login/lenke' || pathname.startsWith('/api/labels/')

  if (!data?.claims && !isPublic) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/admin/login'
    redirectUrl.search = ''
    const redirectResponse = NextResponse.redirect(redirectUrl)
    response.cookies.getAll().forEach((c) => redirectResponse.cookies.set(c))
    return redirectResponse
  }
  return response
}

export const config = {
  matcher: ['/admin/:path*', '/api/labels/:path*'],
}
