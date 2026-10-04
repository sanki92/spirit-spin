import { describe, expect, it } from 'vitest'
import { battleHash, stepBattle, type BattleEvent, type TickInput } from '../battle'
import { cloneBattle, cloneTimeline, Replayer, startTimeline, stepTimeline, timelineHash, toTick } from './replay'
import type { Frame } from './wire'
import { f, fresh } from './testkit'

describe('replay', () => {
  it('cloneBattle is a deep, independent, hash-identical copy that shares specs', () => {
    const s = fresh()
    const c = cloneBattle(s)
    expect(c).toEqual(structuredClone(s))
    expect(c.specs).toBe(s.specs)
    c.tops[0].x = 99
    c.rng.s = 1
    expect(s.tops[0].x).not.toBe(99)
    expect(battleHash(cloneBattle(s))).toBe(battleHash(s))
  })

  it('spirit fires only on the frame the counter changes', () => {
    expect(toTick({ x: 127, y: 0, sp: 1 }, 0)).toEqual({ tiltX: 1, tiltY: 0, spirit: true })
    expect(toTick({ x: 0, y: -127, sp: 1 }, 1)).toEqual({ tiltX: 0, tiltY: -1, spirit: false })
    expect(toTick({ x: 0, y: 0, sp: 0 }, 255).spirit).toBe(true)
  })

  it('stepping a timeline equals stepping the battle with the equivalent tick inputs', () => {
    const frames: Frame[] = Array.from({ length: 300 }, (_, i) => f(i % 50, -40, i > 120 ? 1 : 0, -30, (i * 7) % 90, i > 200 ? 2 : 0))
    const tl = startTimeline(fresh())
    const out: BattleEvent[] = []
    for (const fr of frames) stepTimeline(tl, fr, out)
    const s = fresh()
    let prev = [0, 0]
    for (const fr of frames) {
      const ins: [TickInput, TickInput] = [toTick(fr[0], prev[0]!), toTick(fr[1], prev[1]!)]
      stepBattle(s, ins, [])
      prev = [fr[0].sp, fr[1].sp]
    }
    expect(battleHash(tl.state)).toBe(battleHash(s))
    expect(tl.frame).toBe(300)
    expect(tl.sp).toEqual([1, 2])
    expect(timelineHash(tl)).toBe(parseInt(battleHash(s), 16) >>> 0)
  })

  it('replayer accepts contiguous frames, ignores duplicates, rejects gaps', () => {
    const r = new Replayer(startTimeline(fresh()))
    const fr = (i: number) => f(i, 0, 0, 0, 0, 0)
    expect(r.push(1, [fr(1), fr(2), fr(3)])).toBe(3)
    expect(r.push(2, [fr(2), fr(3), fr(4)])).toBe(1)
    expect(r.push(9, [fr(9)])).toBe(0)
    expect(r.received).toBe(4)
    expect(r.backlog).toBe(4)
    const out: BattleEvent[] = []
    while (r.stepOne(out));
    expect(r.frame).toBe(4)
    expect(r.backlog).toBe(0)
    expect(r.tl.last[0].x).toBe(4)
  })

  it('cloneTimeline is independent', () => {
    const a = startTimeline(fresh())
    const b = cloneTimeline(a)
    stepTimeline(b, f(10, 10, 1, 0, 0, 0), [])
    expect(a.frame).toBe(0)
    expect(a.sp).toEqual([0, 0])
  })
})
