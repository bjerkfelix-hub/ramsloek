import Link from 'next/link'
import { getDictionary, type Locale } from '@/content'
import { ROUTES } from '@/lib/public/routes'
import { LeafIllustration } from './leaf-illustration'

export function NotFoundContent({ locale }: { locale: Locale }) {
  const { notFound } = getDictionary(locale)
  return (
    <div className="flex flex-col items-start gap-4 py-12 sm:py-16">
      <LeafIllustration className="w-16 text-forest" />
      <h1 className="font-display text-4xl font-semibold text-forest">{notFound.heading}</h1>
      <p className="max-w-[60ch] text-lg">{notFound.text}</p>
      <Link href={ROUTES[locale].home} className="inline-block py-2 font-medium text-forest underline">
        {notFound.backHome}
      </Link>
    </div>
  )
}
