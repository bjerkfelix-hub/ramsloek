import { describe, expect, it } from 'vitest'
import { clientIp, createRateLimiter } from './rate-limit'

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
})

describe('clientIp', () => {
  it('uses the first x-forwarded-for entry', () => {
    expect(clientIp('203.0.113.7, 10.0.0.1')).toBe('203.0.113.7')
  })
  it("falls back to 'unknown'", () => {
    expect(clientIp(null)).toBe('unknown')
    expect(clientIp('')).toBe('unknown')
  })
})
