import { describe, expect, it } from 'vitest'
import { calibrate, rpmQuality, scoreRip, type RipResult } from './rip'
import { pullTrace } from './rip.fixtures'

const ok = (r: ReturnType<typeof scoreRip>): RipResult => { if (!r.ok) throw new Error(`expected rip, got ${r.reason}`); return r }
/** calibrate so this trace's pull is exactly `ratio` of the player's normal rip */
const calFor = (trace: ReturnType<typeof pullTrace>, ratio: number) => ({ pull100: ok(scoreRip(trace, 0, { pull100: 1 })).pullRatio / ratio })

describe('scoreRip', () => {
  it('on-beat, straight, normal-strength rip is PERFECT', () => {
    const tr = pullTrace({ start: 20 })
    const r = ok(scoreRip(tr, 0, calFor(tr, 0.9)))
    expect(r.quality).toBe('PERFECT'); expect(r.overspin).toBe(false); expect(r.style).toBe('flat')
    expect(r.straightness).toBeGreaterThan(0.9)
  })
  it('a yank that brakes is still straight (sign-independent axis)', () => {
    const tr = pullTrace({ start: 0, decelMs: 200 })
    expect(ok(scoreRip(tr, 0, calFor(tr, 0.9))).straightness).toBeGreaterThan(0.9)
  })
  it('300 ms late drops to GOOD or worse', () => {
    const tr = pullTrace({ start: 300 })
    expect(['GOOD', 'WEAK']).toContain(ok(scoreRip(tr, 0, calFor(tr, 0.9))).quality)
  })
  it('zig-zag pull scores low straightness', () => {
    const tr = pullTrace({ start: 0, zigzag: true })
    expect(ok(scoreRip(tr, 0, calFor(tr, 0.9))).straightness).toBeLessThan(0.5)
  })
  it('pulling 180% of calibration overspins, 140% does not', () => {
    const tr = pullTrace({ start: 0 })
    expect(ok(scoreRip(tr, 0, calFor(tr, 1.8))).overspin).toBe(true)
    expect(ok(scoreRip(tr, 0, calFor(tr, 1.4))).overspin).toBe(false)
  })
  it('noPull: no strong motion -> no-pull failure', () => {
    expect(scoreRip(pullTrace({ start: 0, noPull: true }), 0, { pull100: 4 })).toEqual({ ok: false, reason: 'no-pull' })
  })
  it('too early / too late are reported', () => {
    expect(scoreRip(pullTrace({ start: -700 }), 0, { pull100: 4 })).toMatchObject({ ok: false, reason: 'too-early' })
    expect(scoreRip(pullTrace({ start: 800 }), 0, { pull100: 4 })).toMatchObject({ ok: false, reason: 'too-late' })
  })
  it('clipped sensor still ranks a longer pull above a shorter one', () => {
    const short = ok(scoreRip(pullTrace({ start: 0, peak: 120, clip: 78, accelMs: 90, decelMs: 60 }), 0, { pull100: 4 }))
    const long = ok(scoreRip(pullTrace({ start: 0, peak: 120, clip: 78, accelMs: 160, decelMs: 90 }), 0, { pull100: 4 }))
    expect(long.pullRatio).toBeGreaterThan(short.pullRatio * 1.3)
  })
  it('roll picks bank style and direction', () => {
    const tr = pullTrace({ start: 0, roll: 30 })
    expect(ok(scoreRip(tr, 0, { pull100: 4 }))).toMatchObject({ style: 'bank', bankDir: 1 })
    expect(ok(scoreRip(pullTrace({ start: 0, roll: -30 }), 0, { pull100: 4 })).bankDir).toBe(-1)
  })
  it('rpm is in 0..15000 and rounded to 10', () => {
    const r = ok(scoreRip(pullTrace({ start: 40 }), 0, { pull100: 4 }))
    expect(r.rpm % 10).toBe(0); expect(r.rpm).toBeGreaterThanOrEqual(0); expect(r.rpm).toBeLessThanOrEqual(15000)
  })
})

describe('calibrate / quality', () => {
  it('median, clamped', () => {
    expect(calibrate([3, 5, 100]).pull100).toBe(5)
    expect(calibrate([0.1]).pull100).toBe(1.5)
    expect(calibrate([]).pull100).toBe(7)
  })
  it('quality thresholds', () => {
    expect(rpmQuality(13000)).toBe('PERFECT'); expect(rpmQuality(12990)).toBe('GREAT')
    expect(rpmQuality(10000)).toBe('GREAT'); expect(rpmQuality(9990)).toBe('GOOD')
    expect(rpmQuality(6000)).toBe('GOOD'); expect(rpmQuality(5990)).toBe('WEAK')
  })
})
