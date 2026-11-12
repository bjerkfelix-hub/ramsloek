import Link from 'next/link'
import { connection } from 'next/server'
import { getDictionary, type Locale } from '@/content'
import { ROUTES } from '@/lib/public/routes'
import { getPublicProducts } from '@/lib/public/products'
import { PageHeading } from './page-heading'

export async function ShopPage({ locale }: { locale: Locale }) {
  await connection()
  const dict = getDictionary(locale)
  const { shop } = dict
  const products = await getPublicProducts()
  return (
    <div className="flex flex-col gap-8 pb-4 pt-8 sm:pt-12">
      <PageHeading title={shop.heading} lead={shop.lead} />
      <section className="flex max-w-[65ch] flex-col gap-4 text-lg">
        {shop.paragraphs.map((p) => (
          <p key={p}>{p}</p>
        ))}
        <Link
          className="inline-flex min-h-11 items-center font-medium text-forest underline"
          href={ROUTES[locale].markets}
        >
          {dict.nav.markets}
        </Link>
      </section>
      <section className="flex flex-col gap-4">
        <h2 className="font-display text-2xl font-semibold text-forest">{shop.productsHeading}</h2>
        {products === null ? (
          <p role="status">{shop.loadFailed}</p>
        ) : products.length === 0 ? (
          <p>{shop.empty}</p>
        ) : (
          <ul className="divide-y divide-line rounded-2xl border border-line bg-cream px-5">
            {products.map((p) => (
              <li key={p.name} className="flex flex-wrap justify-between gap-2 py-4">
                <span>{p.name}</span>
                <span>{p.net_weight_g} g</span>
              </li>
            ))}
          </ul>
        )}
        <p>{shop.prices}</p>
      </section>
      <div className="flex flex-wrap gap-4">
        {(['interest', 'wholesale'] as const).map((key) => (
          <Link
            key={key}
            href={ROUTES[locale][key]}
            className="inline-flex min-h-11 items-center rounded-lg bg-forest px-5 py-3 font-medium text-cream hover:bg-forest-dark"
          >
            {dict.nav[key]}
          </Link>
        ))}
      </div>
    </div>
  )
}
