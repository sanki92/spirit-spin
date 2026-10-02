import { describe, expect, it } from 'vitest'
import { tracePlausible, swipePlausible } from './plausibility'
import { pullTrace } from './rip.fixtures'

describe('tracePlausible', () => {
  it('a realistic jittery noisy trace passes', () => expect(tracePlausible(pullTrace({ start: 0 }))).toEqual({ ok: true, reasons: [] }))
  it('perfectly regular timestamps are flagged', () => {
    const tr = pullTrace({ start: 0 }).map((s, i) => ({ ...s, t: i * 16 }))
    expect(tracePlausible(tr).reasons).toContain('no-interval-jitter')
  })
  it('noise-free rest is flagged', () => {
    const tr = pullTrace({ start: 0 }).map(s => (Math.abs(s.ay) < 3 ? { ...s, ax: 0, ay: 0, az: 0 } : s))
    expect(tracePlausible(tr).reasons).toContain('no-sensor-noise')
  })
  it('impossible acceleration is flagged', () => {
    const tr = pullTrace({ start: 0 }); tr[80] = { ...(tr[80] as typeof tr[number]), ay: -300 }
    expect(tracePlausible(tr).reasons).toContain('impossible-accel')
  })
  it('too few samples is flagged', () => expect(tracePlausible(pullTrace({ start: 0 }).filter((_, i) => i % 5 === 0)).reasons).toContain('low-sample-rate'))
  it('repeated identical vectors are flagged', () => {
    const tr = pullTrace({ start: 0 }); for (let i = 10; i < 22; i++) tr[i] = { ...(tr[i] as typeof tr[number]), ax: 1, ay: 2, az: 3 }
    expect(tracePlausible(tr).reasons).toContain('repeated-samples')
  })
})

describe('swipePlausible', () => {
  const pts = (n: number, dt: number) => Array.from({ length: n }, (_, i) => ({ t: 10 + i * dt, x: 200 + (i % 2), y: 100 + i * 50 }))
  it('accepts a real swipe sampled at touch rate', () => {
    expect(swipePlausible(pts(11, 16))).toBe(true)
  })
  it('rejects forged two-point or sparse swipes', () => {
    expect(swipePlausible([{ t: 0, x: 0, y: 0 }, { t: 120, x: 0, y: 900 }])).toBe(false)
    expect(swipePlausible(pts(8, 90))).toBe(false)
    expect(swipePlausible(pts(8, 0))).toBe(false)
  })
})
