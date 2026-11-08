'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function AdminNav({ links }: { links: { href: string; label: string }[] }) {
  const pathname = usePathname()
  return (
    <nav aria-label="Hovedmeny" className="admin-nav">
      <ul>
        {links.map((item, index) => {
          const active = item.href === '/admin' ? pathname === item.href : pathname.startsWith(item.href)
          return (
            <li key={item.href}>
              <Link href={item.href} aria-current={active ? 'page' : undefined}>
                <span className="admin-nav-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                {item.label}<span className="admin-nav-arrow" aria-hidden="true">↗</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
