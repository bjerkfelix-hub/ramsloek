import Link from 'next/link'
import { requireRole } from '@/lib/auth'
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireRole('owner')
  return (
    <>
      <nav aria-label="Påmeldinger" className="flex flex-wrap gap-2 px-4 pt-4">
        {[
          ['/admin/pameldinger', 'Sesongvarsel'],
          ['/admin/pameldinger/interesse', 'Interesse'],
          ['/admin/pameldinger/henvendelser', 'Henvendelser'],
        ].map(([href, label]) => (
          <Link className="a-btn a-btn-tinted" key={href} href={href}>
            {label}
          </Link>
        ))}
      </nav>
      {children}
    </>
  )
}
