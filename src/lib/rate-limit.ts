const MAX_KEYS = 5000

/** Fixed-window in-memory rate limiter (per process; good enough for a single small instance). */
export function createRateLimiter({
  max,
  windowMs,
  now = Date.now,
  maxKeys = MAX_KEYS,
}: {
  max: number
  windowMs: number
  now?: () => number
  maxKeys?: number
}) {
  const hits = new Map<string, { count: number; resetAt: number }>()

  return {
    /** Counts an attempt for `key`; returns false once more than `max` attempts fall in the window. */
    attempt(key: string): boolean {
      const t = now()
      const entry = hits.get(key)
      if (!entry || entry.resetAt <= t) {
        hits.delete(key)
        if (hits.size >= maxKeys) {
          for (const [k, v] of hits) if (v.resetAt <= t) hits.delete(k)
          // Still full: drop the oldest entries (Map keeps insertion order).
          for (const k of hits.keys()) {
            if (hits.size < maxKeys) break
            hits.delete(k)
          }
        }
        hits.set(key, { count: 1, resetAt: t + windowMs })
        return true
      }
      entry.count += 1
      return entry.count <= max
    },
    size: () => hits.size,
  }
}

/**
 * Client IP behind a proxy: x-real-ip if set, else the LAST x-forwarded-for entry (the proxy appends the
 * real peer; earlier entries are client-controlled), else 'unknown'.
 */
export function clientIp(headers: { get(name: string): string | null }): string {
  const real = headers.get('x-real-ip')?.trim()
  if (real) return real
  const parts = (headers.get('x-forwarded-for') ?? '').split(',').map((p) => p.trim()).filter(Boolean)
  return parts[parts.length - 1] ?? 'unknown'
}
