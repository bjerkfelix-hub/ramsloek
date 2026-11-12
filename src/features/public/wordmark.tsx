import Link from 'next/link'
import { SITE_NAME } from '@/content'

export function Wordmark({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 items-center font-display text-2xl font-semibold tracking-tight text-forest no-underline sm:text-[1.75rem]"
    >
      {SITE_NAME}
    </Link>
  )
}
