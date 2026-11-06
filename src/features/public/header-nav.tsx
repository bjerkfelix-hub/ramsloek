'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LanguageSwitch } from './language-switch'

type Item = { href: string; label: string }

const linkClass =
  'inline-block py-2 text-ink underline decoration-transparent hover:decoration-forest aria-[current=page]:font-semibold aria-[current=page]:text-forest aria-[current=page]:decoration-forest'

export function HeaderNav({ items, label, switchLabel }: { items: Item[]; label: string; switchLabel: string }) {
  const pathname = usePathname() ?? '/'
  return (
    <nav aria-label={label}>
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 sm:gap-x-5">
        {items.map((item) => {
          const current = pathname === item.href || pathname.startsWith(`${item.href}/`)
          return (
            <li key={item.href}>
              <Link href={item.href} aria-current={current ? 'page' : undefined} className={linkClass}>
                {item.label}
              </Link>
            </li>
          )
        })}
        <li className="sm:border-l sm:border-line sm:pl-5">
          <LanguageSwitch label={switchLabel} className={linkClass} />
        </li>
      </ul>
    </nav>
  )
}
