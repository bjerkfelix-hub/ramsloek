/** Fixed-window in-memory rate limiter (per process; good enough for a single small instance). */
export function createRateLimiter({
  max,
  windowMs,
  now = Date.now,
}: {
  max: number
  windowMs: number
  now?: () => number
}) {
  const hits = new Map<string, { count: number; resetAt: number }>()

  return {
    /** Counts an attempt for `key`; returns false once more than `max` attempts fall in the window. */
    attempt(key: string): boolean {
      const t = now()
      // Drop expired entries so the map cannot grow without bound.
      if (hits.size > 1000) {
        for (const [k, v] of hits) if (v.resetAt <= t) hits.delete(k)
      }
      const entry = hits.get(key)
      if (!entry || entry.resetAt <= t) {
        hits.set(key, { count: 1, resetAt: t + windowMs })
        return true
      }
      entry.count += 1
      return entry.count <= max
    },
  }
}

/** First entry of x-forwarded-for (Railway's proxy sets it), or 'unknown'. */
export function clientIp(forwardedFor: string | null): string {
  const first = forwardedFor?.split(',')[0]?.trim()
  return first || 'unknown'
}
