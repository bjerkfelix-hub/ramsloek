import { ContactPage } from '@/features/public/pages/contact-page'
import { pageMetadataFor } from '@/features/public/pages/metadata'

export const generateMetadata = pageMetadataFor('en', 'interest')
export default function Page() { return <ContactPage locale="en" kind="interest" /> }
