import Link from 'next/link'
import { COMPANY, CONTACT_EMAIL, format, getDictionary, SITE_NAME, type Locale } from '@/content'
import { contactHref, ROUTES } from '@/lib/public/routes'
import { CurrentYear } from './current-year'
import { LanguageSwitch } from './language-switch'

const linkClass = 'inline-flex min-h-11 items-center py-1 text-ink underline decoration-line hover:decoration-forest'

export function Footer({ locale }: { locale: Locale }) {
  const { nav, footer, site } = getDictionary(locale)
  const routes = ROUTES[locale]
  const links = [
    { href: routes.shop, label: nav.shop },
    { href: routes.interest, label: nav.interest },
    { href: routes.wholesale, label: nav.wholesale },
    { href: routes.story, label: nav.story },
    { href: routes.recipes, label: nav.recipes },
    { href: routes.markets, label: nav.markets },
    { href: routes.privacy, label: nav.privacy },
  ]
  const [rightsBefore, rightsAfter] = format(footer.rights, { year: '\u0000', name: SITE_NAME }).split('\u0000')
  return (
    <footer className="mt-16 border-t border-line bg-sage">
      <div className="mx-auto grid max-w-3xl gap-8 px-4 py-10 sm:grid-cols-2 sm:px-6">
        <div className="flex flex-col gap-2">
          <p className="font-display text-xl font-semibold text-forest">{SITE_NAME}</p>
          <p className="text-muted">{site.tagline}</p>
          <p>
            {footer.languageLabel}: <LanguageSwitch label={nav.switchToOther} className={linkClass} />
          </p>
        </div>
        <ul className="flex flex-col gap-1 sm:items-end">
          {links.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className={linkClass}>
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted sm:col-span-2">
          {rightsBefore}
          <CurrentYear />
          {rightsAfter}
        </p>
        <p className="text-sm text-muted sm:col-span-2" data-testid="footer-company">
          {COMPANY.legalName} · {format(footer.orgNumber, { orgNumber: COMPANY.orgNr })} · {COMPANY.address} ·{' '}
          {footer.contact}:{' '}
          <a href={contactHref(CONTACT_EMAIL)} className="inline-flex min-h-11 items-center underline">
            {CONTACT_EMAIL}
          </a>
        </p>
      </div>
    </footer>
  )
}
