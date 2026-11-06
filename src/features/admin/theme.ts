export type ThemePref = 'system' | 'light' | 'dark'

export const THEME_PREFS: readonly ThemePref[] = ['system', 'light', 'dark']

export const THEME_LABELS: Record<ThemePref, string> = { system: 'System', light: 'Lys', dark: 'Mørk' }

export const THEME_COOKIE = 'theme'

// Readable by the server only through the request; the admin root layout turns it into
// <html data-theme> so the first paint already has the right colours (no flash).
export const THEME_COOKIE_OPTIONS = {
  path: '/admin',
  maxAge: 365 * 24 * 60 * 60,
  sameSite: 'lax',
} as const

export function parseThemePref(value: string | undefined | null): ThemePref {
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system'
}
