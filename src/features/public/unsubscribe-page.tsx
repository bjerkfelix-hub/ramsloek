import Link from 'next/link'
import { connection } from 'next/server'
import { getDictionary, type Locale } from '@/content'
import { ROUTES } from '@/lib/public/routes'
import { createAdminClient } from '@/lib/supabase/admin'
import { PageHeading } from './pages/page-heading'

const TOKEN_RE = /^[0-9a-f]{64}$/

/** Marks the sign-up with this token unsubscribed (idempotent). Returns its language, or null for an unknown token. */
async function unsubscribe(token: string): Promise<Locale | null> {
  if (!TOKEN_RE.test(token)) return null
  try {
    const db = createAdminClient()
    const { data } = await db
      .from('season_signups')
      .select('id, language, unsubscribed_at')
      .eq('unsubscribe_token', token)
      .maybeSingle()
    if (!data) return null
    if (!data.unsubscribed_at) {
      const { error } = await db
        .from('season_signups')
        .update({ unsubscribed_at: new Date().toISOString() })
        .eq('id', data.id)
      if (error) return null
    }
    return data.language === 'en' ? 'en' : 'no'
  } catch {
    return null
  }
}

/** The unsubscribe link works on a GET (it is a link in an email). Text language: the sign-up's, else the route's. */
export async function UnsubscribePage({ token, routeLocale }: { token: string; routeLocale: Locale }) {
  await connection()
  const rowLocale = await unsubscribe(token)
  const locale = rowLocale ?? routeLocale
  const { unsubscribe: dict } = getDictionary(locale)
  return (
    <div className="flex flex-col gap-6 pb-4 pt-8 sm:pt-12">
      <PageHeading title={dict.heading} />
      <p className="max-w-[60ch] text-lg" data-testid="unsubscribe-message">
        {rowLocale ? dict.done : dict.invalid}
      </p>
      <p>
        <Link href={ROUTES[locale].home} className="font-medium text-forest underline">
          {dict.backHome}
        </Link>
      </p>
    </div>
  )
}
