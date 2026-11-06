import { ogAlt, OG_SIZE, renderOgImage } from '@/features/public/og-image'

export const alt = ogAlt('en')
export const size = OG_SIZE
export const contentType = 'image/png'

export default function Image() {
  return renderOgImage('en')
}
