import Link from 'next/link'
import { requireRole, type Role } from '@/lib/auth'

const SHORTCUTS: { href: string; label: string; roles: Role[] }[] = [
  { href: '/batches/new', label: 'Ny høsting', roles: ['owner', 'picker'] },
  { href: '/batches', label: 'Partier', roles: ['owner', 'picker', 'seller'] },
  { href: '/stock', label: 'Lager', roles: ['owner', 'picker', 'seller'] },
  { href: '/products', label: 'Produkter', roles: ['owner'] },
  { href: '/users', label: 'Brukere', roles: ['owner'] },
  { href: '/settings', label: 'Innstillinger', roles: ['owner'] },
]

export default async function HomePage() {
  const user = await requireRole('owner', 'picker', 'seller')
  const links = SHORTCUTS.filter((s) => s.roles.includes(user.role))
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Hei, {user.fullName}</h1>
      <ul className="flex flex-col gap-2" aria-label="Snarveier">
        {links.map((s) => (
          <li key={s.href}>
            <Link
              href={s.href}
              data-testid="shortcut"
              className="block rounded border border-green-800 px-4 py-4 text-base font-medium text-green-900"
            >
              {s.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
