import { en } from './en'
import { no } from './no'
import type { Dictionary } from './types'

export type Locale = 'no' | 'en'

export function getDictionary(locale: Locale): Dictionary {
  return locale === 'en' ? en : no
}

export { format } from './format'
export { CONTACT_EMAIL, SITE_NAME } from './site'
export { recipes } from './recipes'
export type { Recipe } from './types'
export type { Dictionary } from './types'
