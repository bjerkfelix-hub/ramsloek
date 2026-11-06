'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from '@/app/actions/auth'
import { Icon } from './icons'
import { isActive, type NavItem } from './nav-items'
import { Sheet } from './Sheet'
import { ThemeSwitch } from './ThemeSwitch'

function current(pathname: string, href: string) {
  return isActive(pathname, href) ? ('page' as const) : undefined
}

function SignOutButton() {
  return (
    <form action={signOut}>
      <button type="submit" className="a-btn a-btn-gray a-btn-sm w-full">
        Logg ut
      </button>
    </form>
  )
}

/** Desktop (≥ 1024px): left sidebar with every item, appearance switch and sign-out. */
export function Sidebar({ items, userName }: { items: NavItem[]; userName: string }) {
  const pathname = usePathname()
  return (
    <aside className="a-sidebar">
      <Link href="/admin" className="a-brand">
        Ramsløk
      </Link>
      <nav aria-label="Hovedmeny">
        <ul>
          {items.map((item) => (
            <li key={item.href}>
              <Link href={item.href} className="a-side-link" aria-current={current(pathname, item.href)}>
                <Icon name={item.icon} />
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="a-sidebar-foot">
        <p className="a-small a-muted truncate px-2">{userName}</p>
        <ThemeSwitch />
        <SignOutButton />
      </div>
    </aside>
  )
}

/** Phone and tablet: translucent top bar. Tablet (641–1023px) also shows every item here. */
export function TopBar({ items, userName }: { items: NavItem[]; userName: string }) {
  const pathname = usePathname()
  return (
    <header className="a-topbar a-material">
      <Link href="/admin" className="a-brand">
        Ramsløk
      </Link>
      <nav aria-label="Hovedmeny" className="a-topnav">
        <ul>
          {items.map((item) => (
            <li key={item.href}>
              <Link href={item.href} className="a-topnav-link" aria-current={current(pathname, item.href)}>
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
        <MoreMenu extras={[]} userName={userName} className="a-topnav-link" />
      </nav>
    </header>
  )
}

/** Phone (≤ 640px): bottom tab bar with Partier, Lager, Marked (owner) and Mer. */
export function TabBar({ items, userName }: { items: NavItem[]; userName: string }) {
  const pathname = usePathname()
  const tabs = items.filter((i) => i.tab)
  const extras = items.filter((i) => !i.tab)
  const moreActive = extras.some((i) => isActive(pathname, i.href))
  return (
    <nav aria-label="Hovedmeny" className="a-tabbar a-material">
      <ul>
        {tabs.map((item) => (
          <li key={item.href}>
            <Link href={item.href} className="a-tab" aria-current={current(pathname, item.href)}>
              <Icon name={item.icon} />
              {item.label}
            </Link>
          </li>
        ))}
        <li>
          <MoreMenu extras={extras} userName={userName} className="a-tab" active={moreActive} icon />
        </li>
      </ul>
    </nav>
  )
}

function MoreMenu({
  extras,
  userName,
  className,
  active,
  icon,
}: {
  extras: NavItem[]
  userName: string
  className: string
  active?: boolean
  icon?: boolean
}) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  return (
    <>
      <button
        type="button"
        className={className}
        aria-haspopup="dialog"
        data-active={active || undefined}
        onClick={() => setOpen(true)}
      >
        {icon && <Icon name="more" />}
        Mer
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Mer">
        <div className="flex flex-col gap-6">
          {extras.length > 0 && (
            <ul className="a-list">
              {extras.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="a-row a-row-link"
                    aria-current={current(pathname, item.href)}
                    onClick={() => setOpen(false)}
                  >
                    <span className="h-6 w-6 text-[var(--a-accent-text)]">
                      <Icon name={item.icon} />
                    </span>
                    <span className={isActive(pathname, item.href) ? 'font-semibold' : undefined}>{item.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <ThemeSwitch />
          <div className="flex flex-col gap-2">
            <p className="a-small a-muted">Innlogget som {userName}</p>
            <SignOutButton />
          </div>
        </div>
      </Sheet>
    </>
  )
}
