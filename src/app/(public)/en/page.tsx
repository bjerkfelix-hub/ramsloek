import { FrontPage } from '@/features/public/front-page'
import { pageMetadataFor } from '@/features/public/pages/metadata'

export const generateMetadata = pageMetadataFor('en', 'home');

export default function HomePage() {
  return <FrontPage locale="en" />
}
