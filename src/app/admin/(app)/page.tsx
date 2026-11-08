import Link from 'next/link'
import { requireRole, type Role } from '@/lib/auth'

const SHORTCUTS: { href: string; label: string; roles: Role[] }[] = [
  { href: '/admin/batches/new', label: 'Ny høsting', roles: ['owner', 'picker'] },
  { href: '/admin/batches', label: 'Partier', roles: ['owner', 'picker', 'seller'] },
  { href: '/admin/stock', label: 'Lager', roles: ['owner', 'picker', 'seller'] },
  { href: '/admin/products', label: 'Produkter', roles: ['owner'] },
  { href: '/admin/marked', label: 'Marked', roles: ['owner'] },
  { href: '/admin/users', label: 'Brukere', roles: ['owner'] },
  { href: '/admin/settings', label: 'Innstillinger', roles: ['owner'] },
]

export default async function HomePage() {
  const user = await requireRole('owner', 'picker', 'seller')
  const links = SHORTCUTS.filter((s) => s.roles.includes(user.role))
  const descriptions: Record<string, string> = {
    'Ny høsting': 'Registrer et nytt høsteparti.',
    Partier: 'Følg høsting, kontroll og pakking.',
    Lager: 'Se beholdning og holdbarhet.',
    Produkter: 'Pakninger, vekter og etiketter.',
    Marked: 'Administrer markedsdager.',
    Brukere: 'Administrer teamet og tilganger.',
    Innstillinger: 'Firmaopplysninger og partiprefiks.',
  }
  return (
    <div className="admin-dashboard">
      <div className="admin-page-heading">
        <h1>Oversikt</h1>
      </div>
      <div className="admin-section-heading"><h2>Snarveier</h2></div>
      <ul className="admin-shortcuts" aria-label="Snarveier">
        {links.map((s, index) => (
          <li key={s.href}>
            <Link href={s.href} className="admin-shortcut">
              <span className="admin-shortcut-top"><span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><span aria-hidden="true">↗</span></span>
              <span data-testid="shortcut" className="admin-shortcut-title">{s.label}</span>
              <span className="admin-shortcut-description">{descriptions[s.label]}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
