import { describe, expect, it } from 'vitest'
import { clientIp, createRateLimiter } from './rate-limit'

const h = (o: Record<string, string>) => ({ get: (n: string) => o[n] ?? null })

describe('createRateLimiter', () => {
  it('allows max attempts per key within the window, then blocks', () => {
    const rl = createRateLimiter({ max: 5, windowMs: 600_000, now: () => 0 })
    for (let i = 0; i < 5; i++) expect(rl.attempt('1.1.1.1')).toBe(true)
    expect(rl.attempt('1.1.1.1')).toBe(false)
    expect(rl.attempt('2.2.2.2')).toBe(true)
  })
  it('allows again after the window has passed', () => {
    let t = 0
    const rl = createRateLimiter({ max: 2, windowMs: 1000, now: () => t })
    rl.attempt('a')
    rl.attempt('a')
    expect(rl.attempt('a')).toBe(false)
    t = 1000
    expect(rl.attempt('a')).toBe(true)
  })
  it('caps the number of tracked keys, dropping expired then oldest', () => {
    let t = 0
    const rl = createRateLimiter({ max: 5, windowMs: 1000, now: () => t, maxKeys: 3 })
    for (const k of ['a', 'b', 'c', 'd', 'e']) rl.attempt(k)
    expect(rl.size()).toBe(3)
    t = 5000
    rl.attempt('f')
    expect(rl.size()).toBe(1)
  })
})

describe('clientIp', () => {
  it('ignores spoofed leftmost x-forwarded-for entries', () => {
    expect(clientIp(h({ 'x-forwarded-for': '6.6.6.6, 203.0.113.7' }))).toBe('203.0.113.7')
  })
  it('prefers x-real-ip', () => {
    expect(clientIp(h({ 'x-real-ip': ' 198.51.100.1 ', 'x-forwarded-for': '1.1.1.1, 2.2.2.2' }))).toBe('198.51.100.1')
  })
  it("falls back to 'unknown'", () => {
    expect(clientIp(h({}))).toBe('unknown')
    expect(clientIp(h({ 'x-forwarded-for': ' , ' }))).toBe('unknown')
  })
})
