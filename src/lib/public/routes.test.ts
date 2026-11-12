import { describe, expect, it } from 'vitest'
import { alternatePath, contactHref, localeOfPath, ROUTES } from './routes'

describe('public routes', () => {
  it('has the same pages in both languages', () => {
    expect(Object.keys(ROUTES.no)).toEqual(Object.keys(ROUTES.en))
    expect(ROUTES.no).toEqual({ shop: '/butikken', interest: '/interesse', wholesale: '/grossist', home: '/', story: '/historien', recipes: '/oppskrifter', markets: '/marked', privacy: '/personvern' })
    expect(ROUTES.en).toEqual({ shop: '/en/shop', interest: '/en/interest', wholesale: '/en/wholesale', home: '/en', story: '/en/story', recipes: '/en/recipes', markets: '/en/markets', privacy: '/en/privacy' })
  })

  it('knows the locale of a path', () => {
    expect(localeOfPath('/')).toBe('no')
    expect(localeOfPath('/marked')).toBe('no')
    expect(localeOfPath('/en')).toBe('en')
    expect(localeOfPath('/en/markets')).toBe('en')
    expect(localeOfPath('/english')).toBe('no')
  })

  it('maps each page to its equivalent in the other language', () => {
    expect(alternatePath('/')).toBe('/en')
    expect(alternatePath('/en')).toBe('/')
    expect(alternatePath('/historien')).toBe('/en/story')
    expect(alternatePath('/en/story')).toBe('/historien')
    expect(alternatePath('/marked')).toBe('/en/markets')
    expect(alternatePath('/en/markets')).toBe('/marked')
    expect(alternatePath('/personvern')).toBe('/en/privacy')
    expect(alternatePath('/oppskrifter')).toBe('/en/recipes')
    expect(alternatePath('/oppskrifter/pesto')).toBe('/en/recipes/pesto')
    expect(alternatePath('/en/recipes/pesto')).toBe('/oppskrifter/pesto')
    expect(alternatePath('/marked/')).toBe('/en/markets')
  })

  it('falls back to the other front page for paths without an equivalent', () => {
    expect(alternatePath('/finnes-ikke')).toBe('/en')
    expect(alternatePath('/avmelding/abc')).toBe('/en')
    expect(alternatePath('/en/nope')).toBe('/')
  })

  it('builds a mailto link with the punycode domain', () => {
    expect(contactHref('post@ramsløk.no')).toBe('mailto:post@xn--ramslk-fya.no')
    expect(contactHref('post@example.com')).toBe('mailto:post@example.com')
  })
})
