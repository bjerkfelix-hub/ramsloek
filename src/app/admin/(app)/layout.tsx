import Link from 'next/link'
import { requireRole, type Role } from '@/lib/auth'
import { AdminNav } from '@/features/admin/nav'
import { signOut } from '@/app/actions/auth'

const NAV: { href: string; label: string; roles: Role[] }[] = [
  { href: '/admin', label: 'Oversikt', roles: ['owner', 'picker', 'seller'] },
  { href: '/admin/batches', label: 'Partier', roles: ['owner', 'picker', 'seller'] },
  { href: '/admin/stock', label: 'Lager', roles: ['owner', 'picker', 'seller'] },
  { href: '/admin/products', label: 'Produkter', roles: ['owner'] },
  { href: '/admin/areas', label: 'Områder', roles: ['owner'] },
  { href: '/admin/marked', label: 'Marked', roles: ['owner'] },
  { href: '/admin/users', label: 'Brukere', roles: ['owner'] },
  { href: '/admin/settings', label: 'Innstillinger', roles: ['owner'] },
]

// Every page here depends on the signed-in user, so the layout reads the session per request
// and blocks on it: real HTTP statuses (redirect to /admin/login, 404 for a disallowed role).
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole('owner', 'picker', 'seller')
  const links = NAV.filter((item) => item.roles.includes(user.role))
  const roleLabel = { owner: 'Eier', picker: 'Plukker', seller: 'Selger' }[user.role]
  return (
    <div className="admin-shell">
      <a href="#admin-content" className="admin-skip">Hopp til innhold</a>
      <aside className="admin-sidebar">
        <Link href="/admin" className="admin-wordmark">ramsløk<span aria-hidden="true">✳</span></Link>
        <p className="admin-sidebar-caption">FRA SKOG TIL BORD</p>
        <AdminNav links={links} />
        <div className="admin-sidebar-bottom">
          <span>Høstet med omtanke.</span>
          <Link href="/">Se nettsiden ↗</Link>
        </div>
      </aside>
      <div className="admin-workspace">
        <header className="admin-topbar">
          <span className="admin-topbar-label">Ramsløk / <strong>Arbeidsrom</strong></span>
          <div className="admin-account">
            <span className="admin-avatar" aria-hidden="true">{user.fullName.slice(0, 1)}</span>
            <span className="admin-account-name">{user.fullName}<small>{roleLabel}</small></span>
            <form action={signOut}>
              <button type="submit" className="admin-signout">Logg ut</button>
            </form>
          </div>
        </header>
        <main id="admin-content" tabIndex={-1} className="admin-content">{children}</main>
        <footer className="admin-footer">Ramsløk <span>Høsting · Pakking · Lager</span></footer>
      </div>
    </div>
  )
}
