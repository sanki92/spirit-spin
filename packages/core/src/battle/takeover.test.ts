import { describe, expect, it } from 'vitest'
import { assembleTop, STARTER_BUILDS, type BeastId } from '../parts'
import type { RipResult } from '../rip'
import { createBattle, stepBattle, battleHash, TUNING as T, type BattleEvent, type BattleState, type TickInput } from './index'

const rip = (rpm: number): RipResult => ({ ok: true, rpm, quality: 'GREAT', overspin: false, style: 'flat', bankDir: 0, timing: 1, straightness: 1, pullRatio: 0.9, startT: 0 })
const IDLE: TickInput = { tiltX: 0, tiltY: 0, spirit: false }
const CALL: TickInput = { tiltX: 0, tiltY: 0, spirit: true }

export function duel(beast: BeastId, foe: BeastId = 'aegiron', seed = 5): BattleState {
  const s = createBattle([assembleTop(STARTER_BUILDS[beast]), assembleTop(STARTER_BUILDS[foe])], [{ rip: rip(12000), hesitate: false }, { rip: rip(12000), hesitate: false }], seed)
  s.tick = 200
  const [a, b] = s.tops
  a.x = -0.4; a.y = 0; a.vx = 0; a.vy = 0
  b.x = 0.4; b.y = 0; b.vx = 0; b.vy = 0
  a.gauge = 1
  return s
}

export function play(s: BattleState, ticks: number, input: (i: number) => readonly [TickInput, TickInput]) {
  const ev: BattleEvent[] = []
  for (let i = 0; i < ticks && !s.outcome; i++) stepBattle(s, input(i), ev)
  return ev
}

describe('summon', () => {
  it('holds both tops still for the whole summon, then hands over to the beast', () => {
    const s = duel('voltfang')
    play(s, 1, () => [CALL, IDLE])
    expect(s.tops[0].summonTicks).toBe(T.summonTicks)
    const snap = JSON.stringify(s.tops.map(t => [t.x, t.y, t.vx, t.vy, t.spin, t.gauge, t.spiritTicks]))
    const ev = play(s, T.summonTicks - 1, () => [{ tiltX: 1, tiltY: 1, spirit: false }, { tiltX: -1, tiltY: 0, spirit: true }])
    expect(JSON.stringify(s.tops.map(t => [t.x, t.y, t.vx, t.vy, t.spin, t.gauge, t.spiritTicks]))).toBe(snap)
    expect(ev.some(e => e.k === 'takeover')).toBe(false)
    const ev2 = play(s, 1, () => [IDLE, IDLE])
    expect(ev2).toEqual([{ k: 'takeover', tick: s.tick, side: 0 }])
    expect(s.tops[0].summonTicks).toBe(0)
    expect(s.tops[0].spiritTicks).toBe(T.takeoverTicks)
  })

  it('both players calling on the same tick summon together and take over together', () => {
    const s = duel('voltfang'); s.tops[1].gauge = 1
    const ev = play(s, T.summonTicks + 1, i => (i === 0 ? [CALL, CALL] : [IDLE, IDLE]))
    expect(ev.filter(e => e.k === 'spirit').length).toBe(2)
    expect(ev.filter(e => e.k === 'takeover').map(e => e.k === 'takeover' && e.side)).toEqual([0, 1])
    expect(s.tops[0].spiritTicks).toBe(s.tops[1].spiritTicks)
  })

  it('an opponent summon during my takeover pauses my takeover clock', () => {
    const s = duel('aegiron', 'voltfang')
    play(s, T.summonTicks + 1, i => (i === 0 ? [CALL, IDLE] : [IDLE, IDLE]))
    play(s, 20, () => [IDLE, IDLE])
    const left = s.tops[0].spiritTicks
    s.tops[1].gauge = 1
    play(s, 1, () => [IDLE, CALL])
    play(s, T.summonTicks - 1, () => [IDLE, IDLE])
    expect(s.tops[0].spiritTicks).toBe(left - 1)
  })

  it('the owner\'s tilt is ignored during the takeover', () => {
    const run = (tilt: number) => {
      const s = duel('voltfang')
      play(s, T.summonTicks + 1, i => (i === 0 ? [CALL, IDLE] : [IDLE, IDLE]))
      play(s, 60, () => [{ tiltX: tilt, tiltY: tilt, spirit: false }, IDLE])
      return battleHash(s)
    }
    expect(run(1)).toBe(run(0))
  })

  it('the opponent keeps control during my takeover', () => {
    const run = (tilt: number) => {
      const s = duel('aegiron')
      play(s, T.summonTicks + 1, i => (i === 0 ? [CALL, IDLE] : [IDLE, IDLE]))
      play(s, 30, () => [IDLE, { tiltX: tilt, tiltY: 0, spirit: false }])
      return battleHash(s)
    }
    expect(run(1)).not.toBe(run(0))
  })
})

const BEASTS: BeastId[] = ['voltfang', 'aegiron', 'nagara', 'agnyx', 'zephyra', 'umbrax']
const FIRST: Record<BeastId, string> = { voltfang: 'dash', aegiron: 'anchor', nagara: 'orbit', agnyx: 'dive', zephyra: 'vortex', umbrax: 'pounce' }

function takeover(beast: BeastId, foe: BeastId = 'aegiron', seed = 5) {
  const s = duel(beast, foe, seed)
  const ev = play(s, T.summonTicks + 1, i => (i === 0 ? [CALL, IDLE] : [IDLE, IDLE]))
  const minD = s.specs[0].radius + s.specs[1].radius
  let closest = Infinity, finite = true
  for (let i = 0; i < T.takeoverTicks && !s.outcome; i++) {
    stepBattle(s, [IDLE, IDLE], ev)
    const [a, b] = s.tops
    closest = Math.min(closest, Math.hypot(a.x - b.x, a.y - b.y))
    finite &&= [a.x, a.y, a.vx, a.vy, a.spin, b.x, b.y, b.vx, b.vy, b.spin].every(Number.isFinite)
  }
  return { s, ev, minD, closest, finite }
}

describe.each(BEASTS)('%s takeover', beast => {
  it('is deterministic, finite, solid, and opens with its signature move', () => {
    const a = takeover(beast), b = takeover(beast)
    expect(battleHash(a.s)).toBe(battleHash(b.s))
    expect(a.finite).toBe(true)
    expect(a.closest).toBeGreaterThan(a.minD * 0.85)
    const moves = a.ev.flatMap(e => (e.k === 'beast' && e.side === 0 ? [e.move] : []))
    expect(moves[0]).toBe(FIRST[beast])
  })
  it('ends within the takeover window and returns control', () => {
    const { s, ev } = takeover(beast)
    if (s.outcome) return
    expect(ev.some(e => e.k === 'spiritEnd' && e.side === 0)).toBe(true)
    expect(s.tops[0].strikeArmed || s.tops[0].stealArmed || s.tops[0].shieldTicks > 0 || s.tops[0].pullTicks > 0).toBe(false)
  })
})

describe('attack effects', () => {
  it('Voltfang dashes up to three times and stuns on contact', () => {
    const { ev, s } = takeover('voltfang')
    expect(ev.filter(e => e.k === 'beast' && e.move === 'dash').length).toBeGreaterThanOrEqual(2)
    expect(ev.filter(e => e.k === 'beast' && e.move === 'dash').length).toBeLessThanOrEqual(3)
    expect(ev.some(e => e.k === 'beast' && e.move === 'strike' && e.side === 0)).toBe(true)
    expect(s.tops[0].act).toBeGreaterThanOrEqual(2)
  })
  it('Aegiron anchors near the centre and its shockwave pushes the rival away', () => {
    const s = duel('aegiron', 'voltfang')
    const ev = play(s, T.summonTicks + 1 + T.tech.slamAt, i => (i === 0 ? [CALL, IDLE] : [IDLE, IDLE]))
    expect(Math.hypot(s.tops[0].x, s.tops[0].y)).toBeLessThan(0.15)
    const before = Math.hypot(s.tops[1].x - s.tops[0].x, s.tops[1].y - s.tops[0].y)
    play(s, 1, () => [IDLE, IDLE]).forEach(e => ev.push(e))
    play(s, 6, () => [IDLE, IDLE])
    expect(ev.some(e => e.k === 'beast' && e.move === 'shockwave')).toBe(true)
    expect(Math.hypot(s.tops[1].x - s.tops[0].x, s.tops[1].y - s.tops[0].y)).toBeGreaterThan(before)
  })
  it('Nagara drains more rival spin than an idle rival loses', () => {
    const idle = duel('nagara'); play(idle, T.summonTicks + 1 + 100, () => [IDLE, IDLE])
    const coil = duel('nagara'); play(coil, T.summonTicks + 1 + 100, i => (i === 0 ? [CALL, IDLE] : [IDLE, IDLE]))
    expect(coil.tops[1].spin).toBeLessThan(idle.tops[1].spin - 0.05)
  })
  it('Agnyx dives after its rise and burns the rival on contact', () => {
    const { ev, s } = takeover('agnyx')
    const dive = ev.find(e => e.k === 'beast' && e.move === 'dive')
    expect(dive && dive.tick).toBeGreaterThan(0)
    expect(ev.some(e => e.k === 'beast' && e.move === 'strike' && e.side === 0)).toBe(true)
    expect(s.tops[1].burnTicks > 0 || !!s.outcome).toBe(true)
  })
  it('Zephyra pulls the rival in, then flings it outward', () => {
    const { ev } = takeover('zephyra')
    const moves = ev.flatMap(e => (e.k === 'beast' && e.side === 0 ? [e.move] : []))
    expect(moves.indexOf('vortex')).toBeLessThan(moves.indexOf('fling'))
  })
  it('Umbrax stays solid, jumps behind the rival and strikes', () => {
    const s = duel('umbrax')
    play(s, T.summonTicks + 1 + T.tech.pounceAt, i => (i === 0 ? [CALL, IDLE] : [IDLE, IDLE]))
    const x0 = s.tops[0].x
    const ev = play(s, 1, () => [IDLE, IDLE])
    expect(ev.some(e => e.k === 'beast' && e.move === 'pounce')).toBe(true)
    expect(Math.abs(s.tops[0].x - x0)).toBeGreaterThan(0.2)
    const rest = play(s, 60, () => [IDLE, IDLE])
    expect(rest.some(e => e.k === 'beast' && e.move === 'strike' && e.side === 0)).toBe(true)
  })
  it('ring-out during a takeover is a spirit finish worth 3', () => {
    const s = duel('aegiron', 'voltfang')
    play(s, T.summonTicks + 1, i => (i === 0 ? [CALL, IDLE] : [IDLE, IDLE]))
    const t = s.tops[1]; t.lastHitTick = s.tick; t.x = 0; t.y = 0.9; t.vx = 0; t.vy = 3
    play(s, 10, () => [IDLE, IDLE])
    expect(s.outcome).toEqual({ winner: 0, finish: 'spirit', points: 3 })
  })
})
