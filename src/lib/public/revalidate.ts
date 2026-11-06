import { revalidatePath } from 'next/cache'
import { ROUTES } from './routes'

export const MARKET_PAGES = ['/admin/marked', ROUTES.no.home, ROUTES.no.markets, ROUTES.en.home, ROUTES.en.markets]

/** Market day changes must show on the public pages straight away. */
export function revalidateMarketPages(): void {
  for (const path of MARKET_PAGES) revalidatePath(path)
}
