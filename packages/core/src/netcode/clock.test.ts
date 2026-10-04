import { describe, expect, it } from 'vitest'
import { beginAt, chooseDelay, ClockControl, RttStats, targetMargin } from './clock'
import { WIRE } from './wire'

describe('clock', () => {
  it('rtt stats: median, min, median absolute deviation (robust to stalls), window of 40', () => {
    const r = new RttStats()
    for (const v of [100, 110, 90, 300, 100]) r.add(v)
    expect(r.rtt).toBe(100)
    expect(r.min).toBe(90)
    expect(r.jitter).toBe(10)
    r.add(Number.NaN)
    r.add(-5)
    expect(r.count).toBe(5)
    for (let i = 0; i < 40; i++) r.add(50)
    expect(r.count).toBe(40)
    expect(r.rtt).toBe(50)
    expect(r.jitter).toBe(0)
  })

  it('chooses input delay from rtt and jitter', () => {
    expect(chooseDelay(20, 3)).toBe(1)
    expect(chooseDelay(120, 15)).toBe(2)
    expect(chooseDelay(150, 30)).toBe(3)
    expect(chooseDelay(200, 10)).toBe(3)
    expect(chooseDelay(300, 10)).toBe(4)
    expect(chooseDelay(100, 50)).toBe(4)
  })

  it('target margin covers three frames of loss plus jitter, capped at 100 ms', () => {
    expect(targetMargin(0)).toBeCloseTo(4 + 3 * WIRE.tickMs, 9)
    expect(targetMargin(10)).toBeCloseTo(24 + 3 * WIRE.tickMs, 9)
    expect(targetMargin(100)).toBe(100)
  })

  it('begins early enough for the first delayed input to arrive with the target margin', () => {
    const t0 = 10000
    const b = beginAt(t0, 100, 2, 20)
    expect(b + 50).toBeCloseTo(t0 + 3 * WIRE.tickMs - 20, 6)
  })

  it('dilates time gently and jumps only when far behind, with a hold', () => {
    const c = new ClockControl(20)
    expect([c.onMargin(20, 0), c.scale]).toEqual([0, 1])
    c.onMargin(12, 0); expect(c.scale).toBe(1.01)
    c.onMargin(2, 0); expect(c.scale).toBe(1.03)
    c.onMargin(28, 0); expect(c.scale).toBe(0.99)
    c.onMargin(60, 0); expect(c.scale).toBe(0.97)
    expect(c.onMargin(-100, 1000)).toBe(Math.ceil(120 / WIRE.tickMs))
    expect(c.onMargin(-100, 1200)).toBe(0)
    expect(c.scale).toBe(1.03)
    expect(c.onMargin(-100, 1999)).toBe(0)
    expect(c.onMargin(-100, 2001)).toBeGreaterThan(0)
  })
})

describe('clock jump threshold', () => {
  it('jumps as soon as inputs arrive late, never while still early', () => {
    const c = new ClockControl(60)
    expect(c.onMargin(1, 0)).toBe(0)
    expect(c.onMargin(-1, 0)).toBe(Math.ceil(61 / WIRE.tickMs))
  })
})
