import { describe, expect, it } from 'vitest'
import { project, rubberband, sheetReleaseTarget, velocityFrom } from './gesture'

describe('project', () => {
  it('uses the exponential-decay projection with d = 0.998', () => {
    // 1000 px/s → 1 * 0.998 / 0.002 = 499 px
    expect(project(1000)).toBeCloseTo(499, 5)
    expect(project(-500)).toBeCloseTo(-249.5, 5)
    expect(project(0)).toBe(0)
  })
})

describe('rubberband', () => {
  it('resists progressively and never exceeds the raw overshoot', () => {
    expect(rubberband(0, 600)).toBe(0)
    const small = rubberband(20, 600)
    const big = rubberband(200, 600)
    expect(small).toBeLessThan(20)
    expect(big).toBeLessThan(200)
    expect(big / 200).toBeLessThan(small / 20)
  })

  it('keeps the sign of the overshoot', () => {
    expect(rubberband(-50, 600)).toBeCloseTo(-rubberband(50, 600), 10)
  })
})

describe('sheetReleaseTarget', () => {
  it('stays open after a short slow drag', () => {
    expect(sheetReleaseTarget(60, 0, 600)).toBe('open')
  })

  it('closes after a drag past half the height', () => {
    expect(sheetReleaseTarget(320, 0, 600)).toBe('closed')
  })

  it('closes on a short fast flick down (projection)', () => {
    expect(sheetReleaseTarget(40, 1200, 600)).toBe('closed')
  })

  it('stays open when flicked back up even if far down', () => {
    expect(sheetReleaseTarget(350, -1500, 600)).toBe('open')
  })
})

describe('velocityFrom', () => {
  it('measures px/s over the recent samples', () => {
    const v = velocityFrom([
      { y: 0, t: 0 },
      { y: 10, t: 16 },
      { y: 30, t: 32 },
      { y: 60, t: 48 },
    ])
    expect(v).toBeCloseTo((60 / 48) * 1000, 5)
  })

  it('ignores samples older than 100 ms before the last one', () => {
    const v = velocityFrom([
      { y: 0, t: 0 },
      { y: 500, t: 400 },
      { y: 520, t: 450 },
    ])
    expect(v).toBeCloseTo((20 / 50) * 1000, 5)
  })

  it('is 0 without movement history', () => {
    expect(velocityFrom([])).toBe(0)
    expect(velocityFrom([{ y: 5, t: 1 }])).toBe(0)
  })
})
