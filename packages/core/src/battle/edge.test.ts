import { describe, expect, it } from 'vitest'
import { assembleTop, STARTER_BUILDS } from '../parts'
import type { RipResult } from '../rip'
import { createBattle, stepBattle, battleHash, DT, ROUND_TICKS, TUNING as T, type BattleEvent, type BattleState, type TickInput } from './index'
import { TIP } from './tuning'

const rip = (overspin = false): RipResult => ({ ok: true, rpm: 12000, quality: 'GREAT', overspin, style: 'flat', bankDir: 0, timing: 1, straightness: 1, pullRatio: 0.9, startT: 0 })
const IDLE: TickInput = { tiltX: 0, tiltY: 0, spirit: false }
const IN: TickInput = { tiltX: 0, tiltY: -1, spirit: false }

function atPocket(spin: number, tick = 200, overspin = false, beast: 'voltfang' | 'agnyx' = 'voltfang'): BattleState {
  const s = createBattle([assembleTop(STARTER_BUILDS[beast]), assembleTop(STARTER_BUILDS.aegiron)], [{ rip: rip(overspin), hesitate: false }, { rip: rip(), hesitate: false }], 7)
  s.tick = tick
  const t = s.tops[0]
  t.x = 0; t.y = 1 - s.specs[0].radius - 0.005; t.vx = 0; t.vy = 2; t.spin = spin; t.lastHitTick = tick
  const f = s.tops[1]
  f.x = 0; f.y = -0.5; f.vx = 0; f.vy = 0
  return s
}

function run(s: BattleState, n: number, input: TickInput = IDLE): BattleEvent[] {
  const ev: BattleEvent[] = []
  for (let i = 0; i < n && !s.outcome; i++) stepBattle(s, [input, IDLE], ev)
  return ev
}

const E = TIP[assembleTop(STARTER_BUILDS.voltfang).tip].edge
const climbIdle = (spin: number) => spin * T.edgeSpinClimb * E * DT * T.edgeTicks

describe('pocket escape', () => {
  it('a knocked top reaching a pocket teeters on the lip instead of leaving', () => {
    const s = atPocket(0.8)
    const ev = run(s, 1)
    const t = s.tops[0]
    expect(t.out).toBe(false)
    expect(t.edgeTicks).toBe(T.edgeTicks)
    expect(t.vx).toBe(0)
    expect(t.vy).toBe(0)
    expect(ev.some(e => e.k === 'edge' && e.side === 0)).toBe(true)
    expect(s.outcome).toBeNull()
  })

  it('a top with plenty of spin climbs back out on its own', () => {
    const spin = 1.25 / (T.edgeSpinClimb * E * DT * T.edgeTicks)
    const s = atPocket(spin)
    const ev = run(s, T.edgeTicks + 2)
    const t = s.tops[0]
    expect(ev.some(e => e.k === 'edgeSave' && e.side === 0)).toBe(true)
    expect(t.out).toBe(false)
    expect(t.edgeTicks).toBe(0)
    expect(t.edgeClimb).toBe(0)
    expect(t.vy).toBeLessThan(0)
  })

  it('a weak top with no steering falls out when the teeter runs out', () => {
    const spin = 0.3
    expect(climbIdle(spin)).toBeLessThan(1)
    const s = atPocket(spin)
    const ev = run(s, T.edgeTicks + 3)
    expect(ev.some(e => e.k === 'edgeSave')).toBe(false)
    expect(s.tops[0].out).toBe(true)
    expect(s.outcome).toEqual({ winner: 1, finish: 'ringout', points: 2 })
  })

  it('steering inward saves a weak top', () => {
    const spin = 0.3
    expect((spin * T.edgeSpinClimb * E + T.edgeSteerClimb) * DT * T.edgeTicks).toBeGreaterThan(1)
    const s = atPocket(spin)
    const ev = run(s, T.edgeTicks + 2, IN)
    expect(ev.some(e => e.k === 'edgeSave' && e.side === 0)).toBe(true)
    expect(s.tops[0].out).toBe(false)
  })

  it('steering outward adds nothing', () => {
    const spin = 0.3
    const s = atPocket(spin)
    run(s, T.edgeTicks + 3, { tiltX: 0, tiltY: 1, spirit: false })
    expect(s.tops[0].out).toBe(true)
  })

  it('a closing hit on a teetering top knocks it out', () => {
    const s = atPocket(0.8)
    run(s, 1)
    expect(s.tops[0].edgeTicks).toBeGreaterThan(0)
    const a = s.tops[0], b = s.tops[1]
    b.x = 0; b.y = a.y - (s.specs[0].radius + s.specs[1].radius) + 0.004; b.vx = 0; b.vy = 2
    run(s, 1)
    expect(a.out).toBe(true)
    expect(s.outcome?.finish).toBe('ringout')
    expect(s.outcome?.winner).toBe(1)
  })

  it('the rival beast in its takeover still rings out instantly', () => {
    const s = atPocket(0.8)
    s.tops[1].spiritTicks = 100
    const ev = run(s, 1)
    expect(ev.some(e => e.k === 'edge')).toBe(false)
    expect(s.tops[0].out).toBe(true)
    expect(s.outcome).toEqual({ winner: 1, finish: 'spirit', points: 3 })
  })

  it('overspin keeps the full launch grace', () => {
    const tick = Math.floor(T.launchGraceTicks * 0.7)
    const s = atPocket(0.8, tick, true)
    expect(s.tops[0].overspinTicks).toBeGreaterThan(0)
    const ev = run(s, 1)
    expect(s.tops[0].out).toBe(false)
    expect(s.tops[0].edgeTicks).toBe(0)
    expect(ev.some(e => e.k === 'edge')).toBe(false)
  })

  it('a flat tip climbs slower than a semi tip with the same spin', () => {
    expect(assembleTop(STARTER_BUILDS.voltfang).tip).toBe('flat')
    expect(assembleTop(STARTER_BUILDS.agnyx).tip).toBe('semi')
    const a = atPocket(0.7), b = atPocket(0.7, 200, false, 'agnyx')
    run(a, 3); run(b, 3)
    expect(b.tops[0].edgeClimb).toBeGreaterThan(a.tops[0].edgeClimb)
  })

  it('time-up while teetering still ends the round on spin', () => {
    const s = atPocket(0.8, ROUND_TICKS - 1)
    run(s, 1)
    expect(s.outcome?.finish).toBe('spin')
  })

  it('teeter state is part of the battle hash', () => {
    const a = atPocket(0.8), b = atPocket(0.8)
    expect(battleHash(a)).toBe(battleHash(b))
    b.tops[0].edgeTicks = 3
    expect(battleHash(a)).not.toBe(battleHash(b))
    b.tops[0].edgeTicks = 0
    b.tops[0].edgeClimb = 0.5
    expect(battleHash(a)).not.toBe(battleHash(b))
  })
})
