import { describe, expect, it } from 'vitest'
import { scoreSwipe, type TouchSample } from './rip-swipe'

const swipe = (o: { start: number; ms: number; dy: number; dx?: number; wobble?: number }): TouchSample[] => {
  const pts: TouchSample[] = []
  for (let i = 0; i <= 10; i++) {
    const f = i / 10
    pts.push({ t: o.start + f * o.ms, x: 200 + (o.dx ?? 0) * f + (o.wobble ?? 0) * (i % 2 ? 1 : -1), y: 100 + o.dy * f })
  }
  return pts
}

describe('scoreSwipe', () => {
  it('brisk straight on-beat swipe is PERFECT and flat', () => {
    const r = scoreSwipe(swipe({ start: 10, ms: 160, dy: 500 }), 0, 800)
    expect(r).toMatchObject({ ok: true, quality: 'PERFECT', style: 'flat' })
  })
  it('short swipe (<25% of screen) is no-pull', () => {
    expect(scoreSwipe(swipe({ start: 0, ms: 100, dy: 100 }), 0, 800)).toEqual({ ok: false, reason: 'no-pull' })
  })
  it('upward swipe is no-pull', () => {
    expect(scoreSwipe(swipe({ start: 0, ms: 150, dy: -500 }), 0, 800)).toEqual({ ok: false, reason: 'no-pull' })
  })
  it('diagonal swipe banks toward its x direction', () => {
    expect(scoreSwipe(swipe({ start: 0, ms: 160, dy: 500, dx: -300 }), 0, 800)).toMatchObject({ ok: true, style: 'bank', bankDir: -1 })
  })
  it('wobbly path lowers straightness', () => {
    const r = scoreSwipe(swipe({ start: 0, ms: 160, dy: 500, wobble: 40 }), 0, 800)
    if (!r.ok) throw new Error('expected ok'); expect(r.straightness).toBeLessThan(0.6)
  })
  it('late swipe is penalized like a late rip', () => {
    const r = scoreSwipe(swipe({ start: 350, ms: 160, dy: 500 }), 0, 800)
    if (!r.ok) throw new Error('expected ok'); expect(r.timing).toBe(0)
  })
})
