import type { Metadata } from 'next'
import { getDictionary } from '@/content'
import { SITE_URL } from '@/lib/public/site'
import { PublicDocument } from '@/features/public/public-document'

const { pages } = getDictionary('no')

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: pages.home.title,
  description: pages.home.description,
}

// Root layout for the Norwegian public pages (<html lang="nb">).
export default function NorwegianLayout({ children }: { children: React.ReactNode }) {
  return <PublicDocument locale="no">{children}</PublicDocument>
}
