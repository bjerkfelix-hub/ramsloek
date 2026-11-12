import { ShopPage } from '@/features/public/pages/shop-page'
import { pageMetadataFor } from '@/features/public/pages/metadata'

export const generateMetadata = pageMetadataFor('no', 'shop')
export default function Page() { return <ShopPage locale="no"  /> }
