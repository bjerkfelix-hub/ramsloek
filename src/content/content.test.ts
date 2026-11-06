import { describe, expect, it } from 'vitest'
import { en } from './en'
import { no } from './no'
import { recipes } from './recipes'
import { getDictionary } from './index'
import { CONTACT_EMAIL } from './site'

function keyPaths(value: unknown, prefix = ''): string[] {
  if (Array.isArray(value)) return [prefix + '[]']
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => keyPaths(v, prefix ? `${prefix}.${k}` : k))
  }
  return [prefix]
}

function strings(value: unknown, path = ''): { path: string; value: string }[] {
  if (typeof value === 'string') return [{ path, value }]
  if (Array.isArray(value)) return value.flatMap((v, i) => strings(v, `${path}[${i}]`))
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => strings(v, path ? `${path}.${k}` : k))
  }
  return []
}

function placeholders(s: string): string[] {
  return [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
}

describe('dictionaries', () => {
  it('have identical key sets', () => {
    expect(keyPaths(en)).toEqual(keyPaths(no))
  })
  it('have list fields of equal length', () => {
    const a = new Map(strings(no).map((s) => [s.path, s.value]))
    const b = new Map(strings(en).map((s) => [s.path, s.value]))
    expect([...b.keys()]).toEqual([...a.keys()])
  })
  it('have no empty strings', () => {
    for (const d of [no, en]) for (const s of strings(d)) expect(s.value.trim(), s.path).not.toBe('')
  })
  it('use the same placeholders in both languages', () => {
    const b = new Map(strings(en).map((s) => [s.path, s.value]))
    for (const s of strings(no)) expect(placeholders(b.get(s.path)!), s.path).toEqual(placeholders(s.value))
  })
  it('getDictionary returns the right language', () => {
    expect(getDictionary('no')).toBe(no)
    expect(getDictionary('en')).toBe(en)
  })
  it('mentions the exact required texts', () => {
    expect(no.signup.success).toBe('Takk! Vi sier fra når sesongen starter.')
    expect(en.signup.success).toBe("Thanks! We'll let you know when the season starts.")
    expect(no.markets.loadFailed).toBe('Markedsdagene kunne ikke lastes akkurat nå')
    expect(en.markets.loadFailed).toBe('Market days could not be loaded right now')
    expect(no.season.offSeason).toBe('Sesongen starter til våren')
    expect(CONTACT_EMAIL).toBe('post@ramsløk.no')
  })
})

describe('recipes', () => {
  it('has six recipes with unique slugs', () => {
    expect(recipes).toHaveLength(6)
    const slugs = recipes.map((r) => r.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9-]+$/)
  })
  it.each(recipes.map((r) => [r.slug, r] as const))('%s is complete in both languages', (_slug, r) => {
    expect(r.image).toBeNull()
    expect(r.servings).toBeGreaterThan(0)
    for (const l of ['no', 'en'] as const) {
      expect(r.title[l].trim()).not.toBe('')
      expect(r.intro[l].trim()).not.toBe('')
      expect(r.time[l].trim()).not.toBe('')
      expect(r.ingredients[l].length).toBeGreaterThanOrEqual(3)
      expect(r.steps[l].length).toBeGreaterThanOrEqual(2)
      for (const s of [...r.ingredients[l], ...r.steps[l]]) expect(s.trim()).not.toBe('')
    }
    expect(r.ingredients.no.length).toBe(r.ingredients.en.length)
    expect(r.steps.no.length).toBe(r.steps.en.length)
  })
  it('lacto-fermented recipe states salt percentage and food safety', () => {
    const r = recipes.find((x) => x.slug === 'lakefermentert-ramslok')!
    expect(r).toBeDefined()
    expect(r.steps.no.join(' ')).toMatch(/2[–-]3 ?%/)
    expect(r.steps.en.join(' ')).toMatch(/2[–-]3 ?%/)
  })
})
