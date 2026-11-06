import '@/app/globals.css'
import './public.css'
import { getDictionary, type Locale } from '@/content'
import { fraunces, inter } from './fonts'
import { Footer } from './footer'
import { Header } from './header'

export const MAIN_ID = 'innhold'

/** The whole public HTML document (used by the NO and EN root layouts and the global 404). */
export function PublicDocument({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const { site } = getDictionary(locale)
  return (
    <html lang={locale === 'en' ? 'en' : 'nb'} className={`${fraunces.variable} ${inter.variable}`}>
      <body className="public-site flex min-h-dvh flex-col">
        <a
          href={`#${MAIN_ID}`}
          className="sr-only rounded bg-forest px-4 py-2 text-cream focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-10"
        >
          {site.skipToContent}
        </a>
        <Header locale={locale} />
        <main id={MAIN_ID} tabIndex={-1} className="mx-auto w-full max-w-3xl flex-1 px-4 sm:px-6">
          {children}
        </main>
        <Footer locale={locale} />
      </body>
    </html>
  )
}
