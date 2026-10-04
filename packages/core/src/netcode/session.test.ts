import { describe, expect, it } from 'vitest'
import { ROLL, RollbackSession } from './session'
import { startTimeline, stepTimeline, timelineHash } from './replay'
import { fresh } from './testkit'
import { IDLE_INPUT, WIRE, type Frame, type WireInput } from './wire'

const me = (i: number): WireInput => ({ x: ((i * 13) % 100) - 50, y: 20, sp: 0 })
const own = (fr: number): WireInput => (fr <= 2 ? IDLE_INPUT : me(fr - 3))
const run = (n: number, side: 0 | 1 = 0) => {
  const s = new RollbackSession(startTimeline(fresh()), side, 2)
  for (let i = 0; i < n; i++) s.advance(me(i), [])
  return s
}
const truth = (from: number, to: number, theirs: (fr: number) => WireInput): Frame[] => Array.from({ length: to - from + 1 }, (_, i) => [own(from + i), theirs(from + i)] as Frame)

describe('rollback session', () => {
  it('confirmations that match the prediction cause no rollback', () => {
    const s = run(10)
    expect(s.confirm(1, truth(1, 5, () => IDLE_INPUT))).toBe('same')
    expect(s.stats.rollbacks).toBe(0)
    expect(s.depth).toBe(5)
  })

  it('a different remote input rolls back to the exact ground truth', () => {
    const s = run(10)
    const theirs = (fr: number) => (fr >= 3 ? { x: -90, y: 5, sp: 0 } : IDLE_INPUT)
    const t = truth(1, 5, theirs)
    expect(s.confirm(1, t)).toBe('rollback')
    const g = startTimeline(fresh())
    for (const fr of t) stepTimeline(g, fr, [])
    for (let fr = 6; fr <= 10; fr++) stepTimeline(g, [own(fr), theirs(5)], [])
    expect(timelineHash(s.predicted)).toBe(timelineHash(g))
    expect(s.stats).toMatchObject({ rollbacks: 1, resimFrames: 5, ownReplaced: 0 })
  })

  it('counts and applies an own input the server replaced', () => {
    const s = run(6)
    const t = truth(1, 4, () => IDLE_INPUT)
    t[2] = [{ x: 0, y: 0, sp: 0 }, IDLE_INPUT]
    expect(s.confirm(1, t)).toBe('rollback')
    expect(s.stats.ownReplaced).toBe(1)
    expect(s.confirmed.last[0]).toEqual(own(4))
  })

  it('applies own input after the input delay and sends unacknowledged inputs', () => {
    const s = run(1)
    expect(s.unsent()).toEqual({ first: 1, inputs: [IDLE_INPUT, IDLE_INPUT, me(0)] })
    s.confirm(1, truth(1, 1, () => IDLE_INPUT))
    expect(s.unsent().first).toBe(2)
    const many = run(40)
    expect(many.unsent().inputs).toHaveLength(Math.min(WIRE.maxInputs, ROLL.maxPredict + 2))
  })

  it(`stalls instead of predicting more than ${ROLL.maxPredict} frames ahead`, () => {
    const s = run(ROLL.maxPredict)
    expect(s.advance(me(99), [])).toBe(false)
    expect(s.stats.stalls).toBe(1)
    expect(s.frame).toBe(ROLL.maxPredict)
  })

  it('confirmed passing predicted jumps (backgrounded phone comes back)', () => {
    const s = run(3)
    expect(s.confirm(1, truth(1, 40, () => IDLE_INPUT).map((f, i) => (i < 3 ? f : [IDLE_INPUT, IDLE_INPUT] as Frame)))).toBe('jump')
    expect(s.frame).toBe(40)
    expect(s.depth).toBe(0)
    expect(s.advance(me(5), [])).toBe(true)
  })

  it('buffers packets that arrive early and applies them once the gap fills', () => {
    const s = run(20)
    const t = truth(1, 12, () => IDLE_INPUT)
    expect(s.confirm(6, t.slice(5, 9))).toBe('same')
    expect(s.confirm(10, t.slice(9, 12))).toBe('same')
    expect(s.confirmed.frame).toBe(0)
    s.confirm(1, t.slice(0, 5))
    expect(s.confirmed.frame).toBe(12)
    const g = startTimeline(fresh())
    for (const fr of t) stepTimeline(g, fr, [])
    expect(timelineHash(s.confirmed)).toBe(timelineHash(g))
  })

  it('counts packets that arrive with a gap', () => {
    const s = run(12)
    const t = truth(1, 10, () => IDLE_INPUT)
    s.confirm(3, t.slice(2, 5))
    expect(s.stats.gaps).toBe(1)
    s.confirm(1, t.slice(0, 5))
    expect(s.stats.gaps).toBe(1)
  })

  it('overlapping packets are idempotent and gaps are ignored', () => {
    const s = run(12)
    const t = truth(1, 10, () => IDLE_INPUT)
    s.confirm(1, t.slice(0, 5))
    s.confirm(3, t.slice(2, 8))
    expect(s.confirmed.frame).toBe(8)
    expect(s.confirm(10, t.slice(9))).toBe('same')
    expect(s.confirmed.frame).toBe(8)
    const g = startTimeline(fresh())
    for (const fr of t.slice(0, 8)) stepTimeline(g, fr, [])
    expect(timelineHash(s.confirmed)).toBe(timelineHash(g))
  })

  it('emits a hash checkpoint every 60 confirmed frames', () => {
    const s = run(30)
    s.confirm(1, truth(1, 130, () => IDLE_INPUT).map((f, i) => (i < 30 ? f : [IDLE_INPUT, IDLE_INPUT] as Frame)))
    expect(s.takeCheckpoints().map(c => c.frame)).toEqual([60, 120])
    expect(s.takeCheckpoints()).toEqual([])
  })

  it('resync replaces the confirmed timeline and re-predicts to the same frame', () => {
    const s = run(10)
    const tl = startTimeline(fresh(3))
    s.resync(tl)
    expect(s.confirmed.frame).toBe(0)
    expect(s.frame).toBe(10)
    expect(s.confirmed.state.rng.s).toBe(tl.state.rng.s)
  })

  it('hides a predicted outcome until it is confirmed', () => {
    const s = run(2)
    s.predicted.state.outcome = { winner: 0, finish: 'ringout', points: 2 }
    expect(s.view().outcome).toBeNull()
    s.confirmed.state.outcome = { winner: 0, finish: 'ringout', points: 2 }
    expect(s.view().outcome).toEqual({ winner: 0, finish: 'ringout', points: 2 })
  })

  it('works for side 1 with mirrored frame order', () => {
    const s = run(4, 1)
    const t = Array.from({ length: 4 }, (_, i) => [IDLE_INPUT, own(i + 1)] as Frame)
    expect(s.confirm(1, t)).toBe('same')
  })
})

describe('rollback session catch-up', () => {
  it('confirmed running ahead by no more than the input delay is not a jump', () => {
    const s = run(3)
    const t = truth(1, 5, () => IDLE_INPUT)
    expect(s.confirm(1, t)).toBe('same')
    expect(s.frame).toBe(5)
    expect(s.stats.jumps).toBe(0)
  })
})

describe('rollback session confirmed-frame hook', () => {
  it('reports every confirmed frame once, in order, with the events that frame produced', () => {
    const s = new RollbackSession(startTimeline(fresh()), 0, 2)
    const seen: { tick: number; events: number }[] = []
    s.onConfirmed = (st, ev, from) => seen.push({ tick: st.tick, events: ev.length - from })
    const idle = Array.from({ length: 30 }, () => [IDLE_INPUT, IDLE_INPUT] as Frame)
    s.confirm(1, idle.slice(0, 10))
    s.confirm(5, idle.slice(4, 20))
    s.confirm(25, idle.slice(24, 30))
    s.confirm(21, idle.slice(20, 24))
    expect(seen.map(x => x.tick)).toEqual(Array.from({ length: 30 }, (_, i) => fresh().tick + i + 1))
    expect(seen.every(x => x.events >= 0)).toBe(true)
  })
})
