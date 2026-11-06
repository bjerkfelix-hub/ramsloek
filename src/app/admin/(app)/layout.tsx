import Link from 'next/link'
import { requireRole, type Role } from '@/lib/auth'
import { signOut } from '@/app/actions/auth'

const NAV: { href: string; label: string; roles: Role[] }[] = [
  { href: '/admin/batches', label: 'Partier', roles: ['owner', 'picker', 'seller'] },
  { href: '/admin/stock', label: 'Lager', roles: ['owner', 'picker', 'seller'] },
  { href: '/admin/products', label: 'Produkter', roles: ['owner'] },
  { href: '/admin/areas', label: 'Områder', roles: ['owner'] },
  { href: '/admin/users', label: 'Brukere', roles: ['owner'] },
  { href: '/admin/settings', label: 'Innstillinger', roles: ['owner'] },
]

// Every page here depends on the signed-in user, so the layout reads the session per request
// and blocks on it: real HTTP statuses (redirect to /admin/login, 404 for a disallowed role).
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole('owner', 'picker', 'seller')
  const links = NAV.filter((item) => item.roles.includes(user.role))
  return (
    <>
      <header className="border-b border-zinc-300 bg-green-900 text-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/admin" className="text-lg font-semibold">
            Ramsløk
          </Link>
          <div className="flex items-center gap-3">
            <span className="truncate text-sm">{user.fullName}</span>
            <form action={signOut}>
              <button type="submit" className="rounded border border-white/60 px-3 py-1 text-sm hover:bg-green-800">
                Logg ut
              </button>
            </form>
          </div>
        </div>
        <nav aria-label="Hovedmeny" className="mx-auto max-w-3xl overflow-x-auto px-2">
          <ul className="flex gap-1 pb-2">
            {links.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="block whitespace-nowrap rounded px-3 py-2 text-sm hover:bg-green-800">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <div className="mx-auto w-full max-w-3xl flex-1 p-4">{children}</div>
    </>
  )
}
