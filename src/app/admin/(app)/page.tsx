import Link from 'next/link'
import { requireRole, type Role } from '@/lib/auth'
import { Chevron } from '@/features/admin/ui/icons'
import { LargeTitle, Page } from '@/features/admin/ui/Page'

const SHORTCUTS: { href: string; label: string; roles: Role[] }[] = [
  { href: '/admin/batches/new', label: 'Ny høsting', roles: ['owner', 'picker'] },
  { href: '/admin/batches', label: 'Partier', roles: ['owner', 'picker', 'seller'] },
  { href: '/admin/stock', label: 'Lager', roles: ['owner', 'picker', 'seller'] },
  { href: '/admin/products', label: 'Produkter', roles: ['owner'] },
  { href: '/admin/marked', label: 'Marked', roles: ['owner'] },
  { href: '/admin/pameldinger', label: 'Påmeldinger', roles: ['owner'] },
  { href: '/admin/users', label: 'Brukere', roles: ['owner'] },
  { href: '/admin/settings', label: 'Innstillinger', roles: ['owner'] },
]

export default async function HomePage() {
  const user = await requireRole('owner', 'picker', 'seller')
  const links = SHORTCUTS.filter((s) => s.roles.includes(user.role))
  return (
    <Page>
      <LargeTitle>Hei, {user.fullName}</LargeTitle>
      <ul className="a-list" aria-label="Snarveier">
        {links.map((s) => (
          <li key={s.href}>
            <Link href={s.href} data-testid="shortcut" className="a-row a-row-link font-medium">
              {s.label}
              <Chevron />
            </Link>
          </li>
        ))}
      </ul>
    </Page>
  )
}
