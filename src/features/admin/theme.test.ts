import { describe, expect, it } from 'vitest'
import { parseThemePref, THEME_COOKIE, THEME_COOKIE_OPTIONS } from './theme'

describe('parseThemePref', () => {
  it('accepts the three preferences', () => {
    expect(parseThemePref('system')).toBe('system')
    expect(parseThemePref('light')).toBe('light')
    expect(parseThemePref('dark')).toBe('dark')
  })

  it('falls back to system for anything else', () => {
    expect(parseThemePref(undefined)).toBe('system')
    expect(parseThemePref('')).toBe('system')
    expect(parseThemePref('DARK')).toBe('system')
    expect(parseThemePref('blue')).toBe('system')
  })
})

describe('theme cookie', () => {
  it('is called theme, scoped to /admin and kept for a year', () => {
    expect(THEME_COOKIE).toBe('theme')
    expect(THEME_COOKIE_OPTIONS.path).toBe('/admin')
    expect(THEME_COOKIE_OPTIONS.maxAge).toBe(365 * 24 * 60 * 60)
    expect(THEME_COOKIE_OPTIONS.sameSite).toBe('lax')
  })
})
