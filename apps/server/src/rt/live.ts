import { encode, SEQ, Sequencer, WIRE, type BattleState, type ServerMsg, type Side, type WireMsg } from '@spirit/core'
import { Verifier } from './verifier'

export const LIVE = { resyncGapMs: 500 } as const

export interface LiveDeps {
  now(): number
  every(ms: number, fn: () => void): () => void
  send(side: Side, b: Uint8Array): void
  watch(b: Uint8Array): void
  resync(side: Side, m: ServerMsg): void
  end(): void
  log(o: Record<string, unknown>): void
}

export class LiveMatch {
  readonly seq: Sequencer
  readonly ver: Verifier
  readonly t0: number
  done = false
  private sent: [number, number] = [0, 0]
  private watched = 0
  private lastSend = -Infinity
  private lastResync: [number, number] = [-Infinity, -Infinity]
  private cancel: () => void

  constructor(readonly round: number, state: BattleState, private d: LiveDeps) {
    this.t0 = d.now() + SEQ.leadInMs
    this.seq = new Sequencer(this.t0)
    this.ver = new Verifier(state)
    this.cancel = d.every(4, () => this.tick())
  }

  private get r8(): number { return this.round & 255 }

  onWire(side: Side, m: WireMsg): void {
    if (this.done || m.op === 'ping' || m.op === 'pong' || m.round !== this.r8) return
    if (m.op === 'input') {
      this.seq.receive(side, m.first, m.inputs, this.d.now())
      this.tick()
    } else if (m.op === 'hash' && this.ver.check(m.frame, m.hash) === 'mismatch') {
      const now = this.d.now()
      if (now - this.lastResync[side] < LIVE.resyncGapMs) return
      this.lastResync[side] = now
      this.d.log({ msg: 'net.desync', level: 'error', round: this.round, side, frame: m.frame, mode: 'node' })
      this.d.resync(side, { k: 'resync', round: this.round, tl: this.ver.tl })
    }
  }

  tick(): void {
    if (this.done) return
    const now = this.d.now()
    const n = this.seq.due(now)
    if (n) this.ver.apply(this.seq.frame - n + 1, this.seq.confirmed.slice(this.seq.frame - n))
    if (n || now - this.lastSend >= WIRE.keepAliveMs) {
      this.flush()
      this.lastSend = now
    }
    if (this.ver.outcome) {
      this.stop()
      this.d.log(this.summary())
      this.d.end()
    }
  }

  private chunks(from: number, upto: number, margin: number): Uint8Array[] {
    if (from >= upto) return [encode({ op: 'frames', round: this.r8, first: from + 1, margin, frames: [] })]
    const out: Uint8Array[] = []
    for (let i = from; i < upto; i += WIRE.maxReliableFrames) out.push(encode({ op: 'frames', round: this.r8, first: i + 1, margin, frames: this.seq.confirmed.slice(i, Math.min(upto, i + WIRE.maxReliableFrames)) }))
    return out
  }

  private flush(): void {
    const upto = this.seq.frame
    for (const side of [0, 1] as const) {
      for (const b of this.chunks(this.sent[side], upto, this.seq.margin(side))) this.d.send(side, b)
      this.sent[side] = upto
    }
    if (this.watched < upto) for (const b of this.chunks(this.watched, upto, 0)) this.d.watch(b)
    this.watched = upto
  }

  catchup(side: Side | null): Extract<ServerMsg, { k: 'catchup' }> {
    if (side !== null) this.sent[side] = this.seq.frame
    return { k: 'catchup', round: this.round, tl: this.ver.tl }
  }

  summary(): Record<string, unknown> {
    return { msg: 'net.round', round: this.round, frames: this.ver.frame, late: [...this.seq.late], missing: [...this.seq.missing], margins: [this.seq.margin(0), this.seq.margin(1)], desyncs: this.ver.desyncs, mode: 'node' }
  }

  stop(): void {
    this.done = true
    this.cancel()
  }
}
