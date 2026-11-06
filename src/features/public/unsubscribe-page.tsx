import Link from 'next/link'
import { connection } from 'next/server'
import { getDictionary, type Locale } from '@/content'
import { ROUTES } from '@/lib/public/routes'
import { createAdminClient } from '@/lib/supabase/admin'
import { PageHeading } from './pages/page-heading'
import { UnsubscribeForm } from './unsubscribe-form'

const TOKEN_RE = /^[0-9a-f]{64}$/

type Lookup = { kind: 'valid'; locale: Locale } | { kind: 'invalid' } | { kind: 'error' }

/** Read-only check of the token; unsubscribing itself is a POST (server action) so link prefetchers cannot trigger it. */
async function lookup(token: string): Promise<Lookup> {
  if (!TOKEN_RE.test(token)) return { kind: 'invalid' }
  try {
    const { data, error } = await createAdminClient()
      .from('season_signups')
      .select('language')
      .eq('unsubscribe_token', token)
      .maybeSingle()
    if (error) throw error
    if (!data) return { kind: 'invalid' }
    return { kind: 'valid', locale: data.language === 'en' ? 'en' : 'no' }
  } catch (e) {
    console.error('Unsubscribe lookup failed', e)
    return { kind: 'error' }
  }
}

/** Text language: the sign-up's, else the route's. */
export async function UnsubscribePage({ token, routeLocale }: { token: string; routeLocale: Locale }) {
  await connection()
  const found = await lookup(token)
  const locale = found.kind === 'valid' ? found.locale : routeLocale
  const dict = getDictionary(locale).unsubscribe
  return (
    <div className="flex flex-col gap-6 pb-4 pt-8 sm:pt-12">
      <PageHeading title={dict.heading} />
      {found.kind === 'valid' ? (
        <UnsubscribeForm token={token} dict={dict} />
      ) : (
        <p className="max-w-[60ch] text-lg" data-testid="unsubscribe-message">
          {found.kind === 'error' ? dict.error : dict.invalid}
        </p>
      )}
      <p>
        <Link href={ROUTES[locale].home} className="font-medium text-forest underline">
          {dict.backHome}
        </Link>
      </p>
    </div>
  )
}
