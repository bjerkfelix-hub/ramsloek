import type { Locale } from '@/content'

export type PageKey = 'home' | 'story' | 'recipes' | 'markets' | 'privacy'

/** Public page paths per language. Both languages have the same pages. */
export const ROUTES: Record<Locale, Record<PageKey, string>> = {
  no: { home: '/', story: '/historien', recipes: '/oppskrifter', markets: '/marked', privacy: '/personvern' },
  en: { home: '/en', story: '/en/story', recipes: '/en/recipes', markets: '/en/markets', privacy: '/en/privacy' },
}

export function localeOfPath(pathname: string): Locale {
  return pathname === '/en' || pathname.startsWith('/en/') ? 'en' : 'no'
}

/** The same page in the other language; the other front page when there is no equivalent. */
export function alternatePath(pathname: string): string {
  const from = localeOfPath(pathname)
  const to: Locale = from === 'en' ? 'no' : 'en'
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  for (const key of Object.keys(ROUTES[from]) as PageKey[]) {
    const base = ROUTES[from][key]
    if (path === base) return ROUTES[to][key]
    // Recipe pages share their slug across languages.
    if (key === 'recipes' && path.startsWith(`${base}/`)) {
      const slug = path.slice(base.length + 1)
      if (/^[a-z0-9-]+$/.test(slug)) return `${ROUTES[to].recipes}/${slug}`
    }
  }
  return ROUTES[to].home
}

/** mailto: link with the domain in punycode (ramsløk.no -> xn--ramslk-fya.no) for mail clients. */
export function contactHref(email: string): string {
  const at = email.lastIndexOf('@')
  const host = new URL(`http://${email.slice(at + 1)}`).hostname
  return `mailto:${email.slice(0, at)}@${host}`
}
