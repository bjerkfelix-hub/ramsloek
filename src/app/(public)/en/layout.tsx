import type { Metadata } from 'next'
import { getDictionary } from '@/content'
import { PublicDocument } from '@/features/public/public-document'

const { pages } = getDictionary('en')

export const metadata: Metadata = {
  title: pages.home.title,
  description: pages.home.description,
}

// Root layout for the English public pages under /en (<html lang="en">).
export default function EnglishLayout({ children }: { children: React.ReactNode }) {
  return <PublicDocument locale="en">{children}</PublicDocument>
}
