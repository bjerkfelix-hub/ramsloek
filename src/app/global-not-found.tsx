import type { Metadata } from 'next'
import { getDictionary } from '@/content'
import { NotFoundContent } from '@/features/public/not-found-content'
import { PublicDocument } from '@/features/public/public-document'

const { pages } = getDictionary('no')

export const metadata: Metadata = {
  title: pages.notFound.title,
  description: pages.notFound.description,
}

// 404 for URLs that match no route. The app has several root layouts, so this renders the whole
// document itself (Norwegian; unknown /en/... paths are caught by the English layout instead).
export default function GlobalNotFound() {
  return (
    <PublicDocument locale="no">
      <NotFoundContent locale="no" />
    </PublicDocument>
  )
}
