import { getDictionary, type Locale } from '@/content'
import { ROUTES } from '@/lib/public/routes'
import { HeaderNav } from './header-nav'
import { Wordmark } from './wordmark'

export function Header({ locale }: { locale: Locale }) {
  const { nav } = getDictionary(locale)
  const routes = ROUTES[locale]
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-4 sm:px-6">
        <Wordmark href={routes.home} />
        <HeaderNav
          label={nav.mainNavigation}
          switchLabel={nav.switchToOther}
          items={[
            { href: routes.shop, label: nav.shop },
            { href: routes.interest, label: nav.interest },
            { href: routes.wholesale, label: nav.business },
            { href: routes.story, label: nav.story },
            { href: routes.recipes, label: nav.recipes },
            { href: routes.markets, label: nav.markets },
          ]}
        />
      </div>
    </header>
  )
}
