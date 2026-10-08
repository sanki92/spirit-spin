import { describe, expect, it } from 'vitest'
import { createBattle, stepBattle, type BattleEvent } from './battle'
import { assembleTop, STARTER_BUILDS } from './parts'
import { tracePlausible } from './plausibility'
import { scoreRip, type MotionSample, type RipResult } from './rip'
import { pullTrace } from './rip.fixtures'
import { scoreSwipe, type TouchSample } from './rip-swipe'

const rip = (rpm: number, extra: Partial<RipResult> = {}): RipResult => ({ ok: true, rpm, quality: 'GREAT', overspin: false, style: 'flat', bankDir: 0, timing: 1, straightness: 1, pullRatio: 0.9, startT: 0, ...extra })

describe('review fixes', () => {
  it('prototype keys are not valid part ids', () => {
    expect(() => assembleTop({ bladeId: 'constructor', discId: 'standard', tipId: 'flat', beastId: 'voltfang' })).toThrow(/blade/)
    expect(() => assembleTop({ bladeId: 'fang', discId: 'toString', tipId: 'flat', beastId: 'voltfang' })).toThrow(/disc/)
  })
  it('a twitch before the window does not void an on-beat rip', () => {
    const tr = pullTrace({ start: 20 })
    for (const s of tr) if (s.t > -820 && s.t < -780) s.ay = -20
    const r = scoreRip(tr, 0, { pull100: 4 })
    expect(r.ok).toBe(true)
  })
  it('swipe timing starts when the finger starts moving, not when it lands', () => {
    const pts: TouchSample[] = [{ t: -300, x: 200, y: 100 }, { t: -150, x: 200, y: 101 }]
    for (let i = 0; i <= 10; i++) pts.push({ t: 10 + i * 16, x: 200, y: 101 + i * 50 })
    const r = scoreSwipe(pts, 0, 800)
    expect(r.ok && r.timing).toBe(1)
  })
  it('swipe with a broken screen height is rejected, not NaN', () => {
    expect(scoreSwipe([{ t: 0, x: 0, y: 0 }, { t: 100, x: 0, y: 500 }], 0, 0)).toEqual({ ok: false, reason: 'no-pull' })
  })
  it('anti-cheat rejects NaN, non-monotonic and too-short traces', () => {
    const tr = pullTrace({ start: 0 })
    expect(tracePlausible(tr.map((s, i) => (i === 40 ? { ...s, t: Number.NaN } : s))).ok).toBe(false)
    expect(tracePlausible(tr.map((s, i) => (i === 40 ? { ...s, t: 0 } : s))).reasons).toContain('non-monotonic')
    expect(tracePlausible(tr.filter(s => s.t >= 0 && s.t < 250)).ok).toBe(false)
  })
  it('an Infinity sample never yields a NaN rip', () => {
    const tr: MotionSample[] = pullTrace({ start: 0 })
    tr[75] = { ...(tr[75] as MotionSample), ay: Infinity }
    const r = scoreRip(tr, 0, { pull100: 4 })
    if (r.ok) expect(Number.isFinite(r.rpm)).toBe(true)
  })
  it('a corrupted rip cannot poison the battle', () => {
    const s = createBattle([assembleTop(STARTER_BUILDS.voltfang), assembleTop(STARTER_BUILDS.aegiron)], [{ rip: rip(Number.NaN), hesitate: false }, { rip: rip(12000), hesitate: false }], 1)
    expect(Number.isFinite(s.tops[0].spin)).toBe(true)
  })
  it('an overspinning top keeps the full launch grace', () => {
    const specs = [assembleTop(STARTER_BUILDS.voltfang), assembleTop(STARTER_BUILDS.aegiron)] as [ReturnType<typeof assembleTop>, ReturnType<typeof assembleTop>]
    const s = createBattle(specs, [{ rip: rip(14000, { overspin: true }), hesitate: false }, { rip: rip(12000), hesitate: false }], 1)
    s.tick = 31
    const t = s.tops[0]; t.x = 0; t.y = 0.9; t.vx = 0; t.vy = 3
    s.tops[1].x = 0; s.tops[1].y = -0.5
    const ev: BattleEvent[] = []
    for (let i = 0; i < 10 && !s.outcome; i++) stepBattle(s, [{ tiltX: 0, tiltY: 0, spirit: false }, { tiltX: 0, tiltY: 0, spirit: false }], ev)
    expect(t.out).toBe(false)
    expect(ev.some(e => e.k === 'edge')).toBe(false)
  })
  it('wobble never goes negative after overspin ends', () => {
    const specs = [assembleTop(STARTER_BUILDS.nagara), assembleTop(STARTER_BUILDS.aegiron)] as [ReturnType<typeof assembleTop>, ReturnType<typeof assembleTop>]
    const s = createBattle(specs, [{ rip: rip(14000, { overspin: true }), hesitate: false }, { rip: rip(12000), hesitate: false }], 2)
    const ev: BattleEvent[] = []
    for (let i = 0; i < 400 && !s.outcome; i++) { stepBattle(s, [{ tiltX: 0, tiltY: 0, spirit: false }, { tiltX: 0, tiltY: 0, spirit: false }], ev); expect(s.tops[0].wobble).toBeGreaterThanOrEqual(0) }
  })
})
