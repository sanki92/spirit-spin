import { describe, expect, it } from 'vitest'
import { tracePlausible, swipePlausible } from './plausibility'
import { pullTrace } from './rip.fixtures'
import { judgeRip } from './ghost'

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
  it('accepts a swipe from a phone dropping to ~12 fps (80 ms between touch points)', () => {
    expect(swipePlausible(pts(8, 80))).toBe(true)
  })
  it('rejects forged two-point or sparse swipes', () => {
    expect(swipePlausible([{ t: 0, x: 0, y: 0 }, { t: 120, x: 0, y: 900 }])).toBe(false)
    expect(swipePlausible(pts(6, 150))).toBe(false)
    expect(swipePlausible(pts(8, 0))).toBe(false)
  })
})

describe('real phone sensor streams', () => {
  const real = { start: 0, noise: 0.04 }
  it('an iPhone pull (fine-grained, quiet sensor) is a real launch', () => {
    for (const seed of [1, 2, 3, 4, 5]) expect(judgeRip({ motion: pullTrace({ ...real, seed }), pull100: 7 }).view).toMatchObject({ ok: true })
  })
  it('an Android Chrome pull (every value rounded to 0.1 m/s² as the spec requires) is a real launch', () => {
    for (const seed of [1, 2, 3, 4, 5]) expect(judgeRip({ motion: pullTrace({ ...real, seed, quantum: 0.1 }), pull100: 7 }).view).toMatchObject({ ok: true })
  })
  it('an Android pull held in a trembling hand is a real launch', () => {
    for (const seed of [6, 7, 8]) expect(judgeRip({ motion: pullTrace({ start: 0, noise: 0.12, seed, quantum: 0.1 }), pull100: 7 }).view).toMatchObject({ ok: true })
  })
  it('a rounded trace with forged repeated readings is still rejected', () => {
    const tr = pullTrace({ start: 0, noise: 0.04, quantum: 0.1 }); for (let i = 10; i < 22; i++) tr[i] = { ...(tr[i] as typeof tr[number]), ax: 1, ay: 2, az: 3 }
    expect(tracePlausible(tr).reasons).toContain('repeated-samples')
  })
})
