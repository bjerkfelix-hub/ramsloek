import { Fraunces, Inter } from 'next/font/google'

// Self-hosted by next/font at build time. latin-ext keeps every Nordic/European letter covered.
export const fraunces = Fraunces({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  axes: ['opsz'],
  variable: '--font-fraunces',
})

export const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  variable: '--font-inter',
})
