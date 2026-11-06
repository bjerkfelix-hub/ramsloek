import { revalidatePath } from 'next/cache'

export const MARKET_PAGES = ['/admin/marked', '/', '/marked', '/en', '/en/markets']

/** Market day changes must show on the public pages straight away. */
export function revalidateMarketPages(): void {
  for (const path of MARKET_PAGES) revalidatePath(path)
}
