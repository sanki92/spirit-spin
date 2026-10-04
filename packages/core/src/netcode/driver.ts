import type { BattleEvent, BattleState, Side } from '../battle'
import { ClockControl } from './clock'
import type { Timeline } from './replay'
import { RollbackSession, type ConfirmResult } from './session'
import { quantizeTilt, type WireMsg } from './wire'

export interface WireSink { send(m: WireMsg): void }

export class NetDriver {
  readonly session: RollbackSession
  readonly clock: ClockControl
  private sp: number

  constructor(start: Timeline, readonly side: Side, readonly round: number, delay: number, target: number, public sink: WireSink) {
    this.session = new RollbackSession(start, side, delay)
    this.clock = new ClockControl(target)
    this.sp = start.last[side].sp
    this.flush()
  }

  get done(): boolean { return !!this.session.confirmed.state.outcome }

  private flush(): void {
    const u = this.session.unsent()
    this.sink.send({ op: 'input', round: this.round & 255, first: u.first, ack: this.session.confirmed.frame, inputs: u.inputs })
  }

  step(tiltX: number, tiltY: number, spirit: boolean, out: BattleEvent[]): boolean {
    if (this.done) return false
    if (spirit) this.sp = (this.sp + 1) & 255
    if (!this.session.advance({ x: quantizeTilt(tiltX), y: quantizeTilt(tiltY), sp: this.sp }, out)) return false
    this.flush()
    return true
  }

  onFrames(m: Extract<WireMsg, { op: 'frames' }>, now: number): { result: ConfirmResult; jump: number } | null {
    if (m.round !== (this.round & 255)) return null
    const result = this.session.confirm(m.first, m.frames)
    for (const c of this.session.takeCheckpoints()) this.sink.send({ op: 'hash', round: this.round & 255, frame: c.frame, hash: c.hash })
    return { result, jump: this.clock.onMargin(m.margin, now) }
  }

  resync(tl: Timeline): void { this.session.resync(tl) }

  view(): BattleState { return this.session.view() }
}
