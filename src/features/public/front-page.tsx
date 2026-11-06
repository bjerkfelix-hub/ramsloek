import Link from 'next/link'
import { connection } from 'next/server'
import { getDictionary, type Locale } from '@/content'
import { todayOslo } from '@/lib/domain/time'
import { getUpcomingMarketDays } from '@/lib/public/market-days'
import { ROUTES } from '@/lib/public/routes'
import { localBusinessJsonLd } from '@/lib/public/structured-data'
import { JsonLd } from './json-ld'
import { LeafIllustration } from './leaf-illustration'
import { MarketList } from './market-list'
import { SeasonBanner } from './season-banner'
import { SignupForm } from './SignupForm'
import { calendarView, seasonFromResult } from './view'

const FRONT_PAGE_MARKETS = 3

export async function FrontPage({ locale }: { locale: Locale }) {
  // Market data is read on every request; revalidatePath only refreshes client caches.
  await connection()
  const dict = getDictionary(locale)
  const routes = ROUTES[locale]
  const result = await getUpcomingMarketDays()
  const season = seasonFromResult(result, todayOslo())
  const calendar = calendarView(result, dict, FRONT_PAGE_MARKETS)

  return (
    <div className="flex flex-col gap-12 pb-4 pt-8 sm:gap-14 sm:pt-12">
      <JsonLd data={localBusinessJsonLd(locale)} />
      <section className="flex flex-col gap-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-forest">{dict.site.tagline}</p>
            <h1 className="mt-2 font-display text-[2.5rem] font-semibold text-ink sm:text-6xl">{dict.home.heading}</h1>
          </div>
          <LeafIllustration className="w-16 shrink-0 text-forest sm:w-24" />
        </div>
        <SeasonBanner status={season} locale={locale} />
      </section>

      <section aria-labelledby="neste-marked" className="flex flex-col gap-4">
        <h2 id="neste-marked" className="font-display text-2xl font-semibold text-forest sm:text-3xl">
          {dict.home.nextMarketsHeading}
        </h2>
        {calendar.kind === 'failed' && (
          <p className="rounded-xl bg-alert-bg px-4 py-3 text-alert">{calendar.message}</p>
        )}
        {calendar.kind === 'empty' && (
          <div className="flex flex-col gap-1">
            <p>{calendar.message}</p>
            <p className="text-muted">{dict.markets.emptyPointer}</p>
          </div>
        )}
        {calendar.kind === 'list' && <MarketList days={calendar.days} locale={locale} />}
        <p>
          <Link href={routes.markets} className="inline-block py-1 font-medium text-forest underline">
            {dict.home.allMarkets}
          </Link>
        </p>
      </section>

      <section className="flex max-w-[65ch] flex-col gap-4 text-lg">
        {dict.home.intro.map((p) => (
          <p key={p}>{p}</p>
        ))}
        <p className="flex flex-wrap gap-x-6 gap-y-1 text-base">
          <Link href={routes.story} className="inline-block py-1 font-medium text-forest underline">
            {dict.home.storyLink}
          </Link>
          <Link href={routes.recipes} className="inline-block py-1 font-medium text-forest underline">
            {dict.home.recipesLink}
          </Link>
        </p>
      </section>

      <SignupForm locale={locale} signup={dict.signup} />
    </div>
  )
}
