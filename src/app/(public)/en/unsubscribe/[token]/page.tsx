import type { Metadata } from 'next'
import { getDictionary } from '@/content'
import { UnsubscribePage } from '@/features/public/unsubscribe-page'

const { pages } = getDictionary('en')

export const metadata: Metadata = {
  title: pages.unsubscribe.title,
  description: pages.unsubscribe.description,
  robots: { index: false, follow: false },
}

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <UnsubscribePage token={token} routeLocale="en" />
}
