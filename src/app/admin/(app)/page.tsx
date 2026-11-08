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
    'Ny høsting': 'Registrer et nytt parti fra skogen.',
    Partier: 'Følg høsting, kontroll og pakking.',
    Lager: 'Se beholdning og holdbarhet.',
    Produkter: 'Pakninger, vekter og etiketter.',
    Marked: 'Planlegg hvor kundene møter oss.',
    Brukere: 'Administrer teamet og tilganger.',
    Innstillinger: 'Firmaopplysninger og partiprefiks.',
  }
  return (
    <div className="admin-dashboard">
      <div className="admin-page-heading">
        <p className="admin-eyebrow">DITT ARBEIDSROM</p>
        <h1>Hei, {user.fullName}</h1>
        <p>Fra første blad til ferdig pakning. Her har du oversikten.</p>
      </div>
      <section className="admin-welcome" aria-labelledby="welcome-title">
        <div>
          <p className="admin-eyebrow">RAMSLØK · DRIFT</p>
          <h2 id="welcome-title">Godt håndverk.<br />Hele veien.</h2>
          <p>Høsting, sortering og lager samlet på ett sted.<br />Velg en oppgave nedenfor for å komme i gang.</p>
        </div>
        <svg className="admin-botanical" viewBox="0 0 240 230" fill="none" aria-hidden="true">
          <path d="M112 221C119 163 140 104 195 27M113 221C106 158 88 98 47 45M113 221C126 159 130 85 119 13" stroke="currentColor" strokeWidth="2" />
          <path d="M128 160C128 101 159 46 205 14C208 77 182 132 128 160ZM104 161C56 145 30 94 38 32C87 59 111 106 104 161ZM121 131C91 92 96 43 116 5C142 51 145 96 121 131Z" fill="currentColor" fillOpacity=".12" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </section>
      <div className="admin-section-heading"><h2>Hva vil du gjøre?</h2><span>Snarveier</span></div>
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
      <p className="admin-dashboard-note">Et godt produkt starter med god oversikt.</p>
    </div>
  )
}
