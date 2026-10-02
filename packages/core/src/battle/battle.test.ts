import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { assembleTop, STARTER_BUILDS } from '../parts'
import type { RipResult } from '../rip'
import { createBattle, stepBattle, battleHash, ROUND_TICKS, type BattleEvent, type BattleState, type TickInput } from './index'

const rip = (rpm: number, extra: Partial<RipResult> = {}): RipResult => ({
  ok: true, rpm, quality: 'GREAT', overspin: false, style: 'flat', bankDir: 0, timing: 1, straightness: 1, pullRatio: 0.9, startT: 0, ...extra,
})
const IDLE: TickInput = { tiltX: 0, tiltY: 0, spirit: false }
const specs = () => [assembleTop(STARTER_BUILDS.voltfang), assembleTop(STARTER_BUILDS.aegiron)] as const
const launch = (r = rip(12000), hesitate = false) => ({ rip: r, hesitate })
const fresh = (seed = 42) => createBattle([...specs()], [launch(rip(12000, { style: 'bank', bankDir: 1 })), launch()], seed)

function run(s: BattleState, ticks: number, inputs: readonly [TickInput, TickInput] = [IDLE, IDLE]) {
  const events: BattleEvent[] = []
  for (let i = 0; i < ticks && !s.outcome; i++) stepBattle(s, inputs, events)
  return events
}

describe('battle determinism', () => {
  it('identical runs hash identically every 60 ticks', () => {
    const a = fresh(), b = fresh()
    for (let i = 0; i < 20; i++) { run(a, 60); run(b, 60); expect(battleHash(a)).toBe(battleHash(b)) }
  })
  it('different seeds diverge', () => {
    const a = fresh(1), b = fresh(2); run(a, 600); run(b, 600)
    expect(battleHash(a)).not.toBe(battleHash(b))
  })
  it('golden hash for seed 42 after 300 ticks is stable', () => {
    const s = fresh(42); run(s, 300)
    expect(battleHash(s)).toMatchSnapshot()
  })
  it('sim sources use no non-deterministic Math functions', () => {
    const dir = join(__dirname)
    for (const f of readdirSync(dir).filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts'))) {
      const src = readFileSync(join(dir, f), 'utf8')
      expect(src, f).not.toMatch(/Math\.(random|sin|cos|tan|atan2?|exp|log|pow)\b/)
    }
  })
})

describe('battle rules', () => {
  it('badInput: NaN / Infinity / huge tilt never corrupts state', () => {
    const s = fresh()
    run(s, 600, [{ tiltX: Number.NaN, tiltY: Infinity, spirit: true }, { tiltX: 1e9, tiltY: -Infinity, spirit: false }])
    for (const t of s.tops) for (const v of Object.values(t)) if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true)
  })
  it('a top that runs out of spin loses by SPIN FINISH (1 pt)', () => {
    const s = fresh(); s.tops[1].spin = 0.015
    const ev = run(s, 2)
    expect(s.outcome).toEqual({ winner: 0, finish: 'spin', points: 1 })
    expect(ev.some(e => e.k === 'finish')).toBe(true)
  })
  it('no ring-out during the launch grace second', () => {
    const s = fresh(); const t = s.tops[1]
    t.x = 0; t.y = 0.9; t.vx = 0; t.vy = 3
    s.tops[0].x = 0; s.tops[0].y = -0.5
    run(s, 10)
    expect(s.tops[1].out).toBe(false)
  })
  it('a top driven out through a pocket loses by RING OUT (2 pts)', () => {
    const s = fresh(); s.tick = 100; const t = s.tops[1]
    t.lastHitTick = 95
    t.x = 0; t.y = 0.9; t.vx = 0; t.vy = 3
    s.tops[0].x = 0; s.tops[0].y = -0.5
    run(s, 10)
    expect(s.outcome).toEqual({ winner: 0, finish: 'ringout', points: 2 })
  })
  it('an un-hit, steady top scrapes off a pocket instead of falling out', () => {
    const s = fresh(); s.tick = 100; const t = s.tops[1]
    t.x = 0; t.y = 0.9; t.vx = 0; t.vy = 3
    s.tops[0].x = 0; s.tops[0].y = -0.5
    run(s, 10)
    expect(s.tops[1].out).toBe(false)
  })
  it('the same push into plain wall bounces instead', () => {
    const s = fresh(); const t = s.tops[1]
    t.x = 0.9; t.y = 0; t.vx = 3; t.vy = 0     // 0 degrees: wall, no pocket
    s.tops[0].x = -0.5; s.tops[0].y = 0
    const ev = run(s, 10)
    expect(s.outcome).toBeNull(); expect(ev.some(e => e.k === 'wall')).toBe(true)
  })
  it('ring out while your beast is manifested is SPIRIT FINISH (3 pts)', () => {
    const s = fresh(); s.tick = 100; s.tops[0].spiritTicks = 100
    const t = s.tops[1]; t.lastHitTick = 95; t.x = 0; t.y = 0.9; t.vx = 0; t.vy = 3
    s.tops[0].x = 0; s.tops[0].y = -0.5
    run(s, 10)
    expect(s.outcome).toEqual({ winner: 0, finish: 'spirit', points: 3 })
  })
  it('simultaneous stop with identical spin is a draw worth 0', () => {
    const s = fresh(); s.tops[0].spin = -1; s.tops[1].spin = -1
    run(s, 1)
    expect(s.outcome).toEqual({ winner: null, finish: 'draw', points: 0 })
  })
  it('simultaneous shatter goes to the top with more spin left', () => {
    const s = fresh(); s.tops[0].shattered = true; s.tops[1].shattered = true; s.tops[0].spin = 0.6; s.tops[1].spin = 0.4
    s.tops[0].x = -0.5; s.tops[1].x = 0.5
    run(s, 1)
    expect(s.outcome).toEqual({ winner: 0, finish: 'shatter', points: 2 })
  })
  it('timeout: higher spin wins a SPIN FINISH', () => {
    const s = fresh(); s.tick = ROUND_TICKS - 1; s.tops[0].spin = 0.9; s.tops[1].spin = 0.4
    s.tops[0].x = -0.3; s.tops[1].x = 0.3
    run(s, 1)
    expect(s.outcome).toEqual({ winner: 0, finish: 'spin', points: 1 })
  })
  it('spirit call with full gauge manifests the beast for ~4 s', () => {
    const s = fresh(); s.tops[0].gauge = 1
    const ev = run(s, 1, [{ tiltX: 0, tiltY: 0, spirit: true }, IDLE])
    expect(ev.some(e => e.k === 'spirit' && e.side === 0)).toBe(true)
    expect(s.tops[0].spiritTicks).toBeGreaterThan(230)
    expect(s.tops[0].gauge).toBe(0)
  })
  it('spirit call without full gauge does nothing', () => {
    const s = fresh(); s.tops[0].gauge = 0.5
    const ev = run(s, 1, [{ tiltX: 0, tiltY: 0, spirit: true }, IDLE])
    expect(ev.some(e => e.k === 'spirit')).toBe(false)
  })
  it('a hesitant beast refuses once (refund 50%), then answers', () => {
    const s = createBattle([...specs()], [launch(rip(12000), true), launch()], 3)
    s.tops[0].gauge = 1
    const ev1 = run(s, 1, [{ tiltX: 0, tiltY: 0, spirit: true }, IDLE])
    expect(ev1.some(e => e.k === 'hesitate')).toBe(true)
    expect(s.tops[0].gauge).toBeGreaterThanOrEqual(0.5); expect(s.tops[0].spiritTicks).toBe(0)
    s.tops[0].gauge = 1
    const ev2 = run(s, 1, [{ tiltX: 0, tiltY: 0, spirit: true }, IDLE])
    expect(ev2.some(e => e.k === 'spirit')).toBe(true)
  })
  it('better rip starts with more spin', () => {
    const a = createBattle([...specs()], [launch(rip(14000)), launch(rip(5000))], 1)
    expect(a.tops[0].spin).toBeGreaterThan(a.tops[1].spin)
  })
  it('overspin starts wobbling hard', () => {
    const a = createBattle([...specs()], [launch(rip(14000, { overspin: true })), launch()], 1)
    expect(a.tops[0].wobble).toBe(1); expect(a.tops[0].overspinTicks).toBeGreaterThan(0)
  })
  it('a full idle battle always ends within the round timer', () => {
    const s = fresh(9); run(s, ROUND_TICKS + 5)
    expect(s.outcome).not.toBeNull()
  })
})
