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
