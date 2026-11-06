'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { alternatePath, localeOfPath } from '@/lib/public/routes'

/** Links to the same page in the other language. */
export function LanguageSwitch({ label, className }: { label: string; className?: string }) {
  const pathname = usePathname() ?? '/'
  const other = localeOfPath(pathname) === 'en' ? 'nb' : 'en'
  return (
    <Link href={alternatePath(pathname)} hrefLang={other} lang={other} className={className}>
      {label}
    </Link>
  )
}
