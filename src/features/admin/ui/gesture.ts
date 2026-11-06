// Gesture maths for the sheet, after Apple's "Designing Fluid Interfaces" (WWDC 2018).

/** Distance a flick travels before coming to rest (UIScrollView-style exponential decay). */
export function project(velocity: number, decelerationRate = 0.998): number {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate)
}

/** Progressive resistance past a boundary: the further past, the less the element follows. */
export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  if (overshoot === 0) return 0
  const sign = Math.sign(overshoot)
  const o = Math.abs(overshoot)
  return (sign * (o * dimension * constant)) / (dimension + constant * o)
}

/** Where a released sheet goes: chosen from the projected resting point, not the release point. */
export function sheetReleaseTarget(offset: number, velocity: number, height: number): 'open' | 'closed' {
  const projected = offset + project(velocity)
  return projected > height / 2 ? 'closed' : 'open'
}

export type Sample = { y: number; t: number }

/** Velocity in px/s over the samples from the last 100 ms. */
export function velocityFrom(samples: Sample[]): number {
  if (samples.length < 2) return 0
  const last = samples[samples.length - 1]
  const first = samples.find((s) => last.t - s.t <= 100) ?? last
  const dt = last.t - first.t
  return dt > 0 ? ((last.y - first.y) / dt) * 1000 : 0
}
