import { ContactPage } from '@/features/public/pages/contact-page'
import { pageMetadataFor } from '@/features/public/pages/metadata'

export const generateMetadata = pageMetadataFor('no', 'wholesale')
export default function Page() { return <ContactPage locale="no" kind="wholesale" /> }
