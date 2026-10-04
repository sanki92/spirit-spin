import type { Side } from '../battle'
import { createRng, rngNext } from '../rng'
import { IDLE_INPUT, WIRE, type Frame, type WireInput } from './wire'

export const SEQ = { graceMs: 4, maxAhead: 120, marginWindow: 30, leadInMs: 600 } as const
export const roundHalfUp = (x: number): number => Math.floor(x + 0.5)

export class Sequencer {
  frame = 0
  readonly confirmed: Frame[] = []
  readonly late: [number, number] = [0, 0]
  readonly missing: [number, number] = [0, 0]
  private pending: [Map<number, WireInput>, Map<number, WireInput>] = [new Map(), new Map()]
  private hi: [number, number] = [0, 0]
  private margins: [number[], number[]] = [[], []]
  private last: [WireInput, WireInput] = [IDLE_INPUT, IDLE_INPUT]

  constructor(readonly t0: number, readonly grace: number = SEQ.graceMs) {}

  deadline(f: number): number {
    return this.t0 + f * WIRE.tickMs + this.grace
  }

  receive(side: Side, first: number, inputs: readonly WireInput[], now: number): void {
    const p = this.pending[side]
    for (let i = 0; i < inputs.length; i++) {
      const f = first + i
      if (f < 1) continue
      const fresh = f > this.hi[side]
      if (fresh) {
        this.hi[side] = f
        const m = this.margins[side]
        m.push(this.deadline(f) - now)
        if (m.length > SEQ.marginWindow) m.shift()
      }
      if (f <= this.frame) { if (fresh) this.late[side]++ }
      else if (f <= this.frame + SEQ.maxAhead && !p.has(f)) p.set(f, inputs[i]!)
    }
  }

  due(now: number): number {
    let n = 0
    for (;;) {
      const f = this.frame + 1
      const a = this.pending[0].get(f), b = this.pending[1].get(f)
      if ((a === undefined || b === undefined) && now < this.deadline(f)) return n
      if (a === undefined) this.missing[0]++
      if (b === undefined) this.missing[1]++
      const fr: Frame = [a ?? this.last[0], b ?? this.last[1]]
      this.pending[0].delete(f)
      this.pending[1].delete(f)
      this.last = [fr[0], fr[1]]
      this.confirmed.push(fr)
      this.frame = f
      n++
    }
  }

  margin(side: Side): number {
    const m = this.margins[side]
    return m.length ? roundHalfUp(Math.min(...m)) : 0
  }
}

export type SeqOp = { op: 'recv'; side: 0 | 1; first: number; now: number; inputs: number[][] } | { op: 'due'; now: number; n: number; margins: [number, number] }
export interface SeqTrace { t0: number; grace: number; ops: SeqOp[]; confirmed: number[][]; late: [number, number]; missing: [number, number] }

export function sequencerTrace(seed: number, steps: number): SeqTrace {
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
