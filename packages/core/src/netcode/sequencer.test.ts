import { readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createRng, rngNext } from '../rng'
import { roundHalfUp, SEQ, Sequencer } from './sequencer'
import { WIRE, type WireInput } from './wire'

type SeqOp = { op: 'recv'; side: 0 | 1; first: number; now: number; inputs: number[][] } | { op: 'due'; now: number; n: number; margins: [number, number] }
interface SeqTrace { t0: number; grace: number; ops: SeqOp[]; confirmed: number[][]; late: [number, number]; missing: [number, number] }

function sequencerTrace(seed: number, steps: number): SeqTrace {
  const r = createRng(seed)
  const int = (n: number) => Math.floor(rngNext(r) * n)
  const s = new Sequencer(1000)
  const ops: SeqOp[] = []
  let now = 1000
  for (let k = 0; k < steps; k++) {
    now += 1 + int(24)
    for (const side of [0, 1] as const) {
      if (rngNext(r) >= 0.25) continue
      const hi = s.frame + int(12) - 3
      const n = 1 + int(6)
      const first = Math.max(1, hi - n + 1)
      const inputs = Array.from({ length: n }, () => [int(255) - 127, int(255) - 127, int(3)])
      s.receive(side, first, inputs.map(([x, y, sp]) => ({ x: x!, y: y!, sp: sp! })), now)
      ops.push({ op: 'recv', side, first, now, inputs })
    }
    if (rngNext(r) < 0.5) ops.push({ op: 'due', now, n: s.due(now), margins: [s.margin(0), s.margin(1)] })
  }
  return { t0: 1000, grace: SEQ.graceMs, ops, confirmed: s.confirmed.map(f => [f[0].x, f[0].y, f[0].sp, f[1].x, f[1].y, f[1].sp]), late: [...s.late], missing: [...s.missing] }
}

const I = (x: number, sp = 0): WireInput => ({ x, y: 0, sp })
const T0 = 1000
const at = (f: number) => T0 + f * WIRE.tickMs + SEQ.graceMs

describe('sequencer', () => {
  it('waits for each frame deadline even when both inputs arrived early, so clients cannot race ahead of the server clock', () => {
    const s = new Sequencer(T0)
    s.receive(0, 1, [I(5), I(6)], T0)
    s.receive(1, 1, [I(-5), I(-6)], T0)
    expect(s.due(T0)).toBe(0)
    expect(s.due(at(1) - 1)).toBe(0)
    expect(s.due(at(1))).toBe(1)
    expect(s.confirmed[0]).toEqual([I(5), I(-5)])
    expect(s.due(at(2))).toBe(1)
    expect(s.confirmed[1]).toEqual([I(6), I(-6)])
  })

  it('at the deadline a missing side repeats its last confirmed input', () => {
    const s = new Sequencer(T0)
    s.receive(0, 1, [I(5)], T0)
    s.receive(1, 1, [I(-5, 2)], T0)
    s.due(at(1))
    s.receive(0, 2, [I(7)], T0)
    expect(s.due(at(2) - 1)).toBe(0)
    expect(s.due(at(2))).toBe(1)
    expect(s.confirmed[1]).toEqual([I(7), I(-5, 2)])
    expect(s.missing).toEqual([0, 1])
  })

  it('drops and counts a late input once, even when it is resent', () => {
    const s = new Sequencer(T0)
    s.due(at(3))
    s.receive(0, 1, [I(9), I(9), I(9)], at(3) + 5)
    s.receive(0, 1, [I(9), I(9), I(9)], at(3) + 20)
    expect(s.late).toEqual([3, 0])
    expect(s.confirmed.map(f => f[0].x)).toEqual([0, 0, 0])
  })

  it('late spirit press fires once on the next confirmed frame', () => {
    const s = new Sequencer(T0)
    for (let f = 1; f <= 3; f++) { s.receive(0, f, [I(0)], T0); s.receive(1, f, [I(0)], T0) }
    s.due(at(3))
    s.receive(1, 4, [I(0), I(0), I(0)], T0)
    s.due(at(4))
    s.receive(0, 4, [I(0, 1), I(0, 1), I(0, 1)], at(4) + 30)
    s.due(at(6))
    const sp = s.confirmed.map(f => f[0].sp)
    expect(sp).toEqual([0, 0, 0, 0, 1, 1])
    expect(sp.filter((v, i) => v !== (sp[i - 1] ?? 0)).length).toBe(1)
  })

  it('reports the worst margin of recent first arrivals, negative when late', () => {
    const s = new Sequencer(T0)
    s.receive(0, 1, [I(0)], at(1) - 20)
    s.receive(0, 1, [I(0), I(0)], at(2) - 3)
    expect(s.margin(0)).toBe(3)
    s.due(at(3))
    s.receive(0, 3, [I(0)], at(3) + 7.4)
    expect(s.margin(0)).toBe(-7)
    expect(s.margin(1)).toBe(0)
  })

  it('does not store frames too far ahead but still reports their margin', () => {
    const s = new Sequencer(T0)
    const f = SEQ.maxAhead + 5
    s.receive(0, f, [I(1)], T0)
    expect(s.margin(0)).toBe(roundHalfUp(at(f) - T0))
    s.receive(1, 1, [I(0)], T0)
    s.due(at(1))
    expect(s.confirmed[0]![0]).toEqual(I(0))
  })

  it('a far-future input does not stop later in-range inputs from counting as fresh', () => {
    const s = new Sequencer(T0)
    s.receive(0, 4_000_000_000, [I(1)], T0)
    s.receive(0, 1, [I(2)], at(1) - 30)
    expect(s.margin(0)).toBe(30)
    s.due(at(1))
    expect(s.confirmed[0]![0]).toEqual(I(2))
  })

  it('lead-in covers the longest launch animation plus a one-way trip', () => {
    expect(SEQ.leadInMs).toBeGreaterThanOrEqual(910 + 150)
  })

  it('matches the golden trace shared with the Go edge', () => {
    const file = new URL('./fixtures/seq-trace.json', import.meta.url)
    const t = sequencerTrace(99, 1500)
    if (process.env.UPDATE_GOLDEN) writeFileSync(file, JSON.stringify(t))
    expect(t).toEqual(JSON.parse(readFileSync(file, 'utf8')))
  })
})
