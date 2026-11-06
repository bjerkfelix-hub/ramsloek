import type { Role } from '@/lib/auth'
import type { IconName } from './icons'

export type NavItem = { href: string; label: string; icon: IconName; tab?: boolean }

const ALL: Role[] = ['owner', 'picker', 'seller']

// Order is the sidebar order. `tab` items are on the phone tab bar; the rest live under "Mer".
const NAV: (NavItem & { roles: Role[] })[] = [
  { href: '/admin/batches', label: 'Partier', icon: 'leaf', roles: ALL, tab: true },
  { href: '/admin/stock', label: 'Lager', icon: 'box', roles: ALL, tab: true },
  { href: '/admin/products', label: 'Produkter', icon: 'tag', roles: ['owner'] },
  { href: '/admin/areas', label: 'Områder', icon: 'pin', roles: ['owner'] },
  { href: '/admin/marked', label: 'Marked', icon: 'calendar', roles: ['owner'], tab: true },
  { href: '/admin/pameldinger', label: 'Påmeldinger', icon: 'mail', roles: ['owner'] },
  { href: '/admin/users', label: 'Brukere', icon: 'people', roles: ['owner'] },
  { href: '/admin/settings', label: 'Innstillinger', icon: 'sliders', roles: ['owner'] },
]

export function navFor(role: Role): NavItem[] {
  return NAV.filter((i) => i.roles.includes(role)).map(({ href, label, icon, tab }) => ({ href, label, icon, tab }))
}

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}
