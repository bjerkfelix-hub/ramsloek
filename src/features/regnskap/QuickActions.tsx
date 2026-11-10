import Link from 'next/link'

/** The two big buttons both roles use at the market. */
export function QuickActions() {
  return (
    <div className="r-actions">
      <Link href="/admin/regnskap/dagsoppgjor" className="a-btn a-btn-primary r-action">
        Dagsoppgjør
      </Link>
      <Link href="/admin/regnskap/utgift/ny" className="a-btn a-btn-tinted r-action">
        Ny utgift
      </Link>
    </div>
  )
}
