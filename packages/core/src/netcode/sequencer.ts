import type { Side } from '../battle'
import { IDLE_INPUT, WIRE, type Frame, type WireInput } from './wire'

export const SEQ = { graceMs: 4, maxAhead: 120, marginWindow: 30, leadInMs: 1100 } as const
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
        if (f <= this.frame + SEQ.maxAhead) this.hi[side] = f
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
      if (now < this.deadline(f)) return n
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
