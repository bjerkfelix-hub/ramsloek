import { FrontPage } from '@/features/public/front-page'
import { pageMetadataFor } from '@/features/public/pages/metadata'

export const generateMetadata = pageMetadataFor('no', 'home');

export default function ForsidePage() {
  return <FrontPage locale="no" />
}
