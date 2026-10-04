import type { BattleEvent, BattleState, Side } from '../battle'
import { CLOCK, ClockControl, clockFrame } from './clock'
import type { Timeline } from './replay'
import { ROLL, RollbackSession, type ConfirmResult } from './session'
import { quantizeTilt, type WireMsg } from './wire'

export interface WireSink { send(m: WireMsg): void }

export class NetDriver {
  readonly session: RollbackSession
  readonly clock: ClockControl
  private sp: number
  private skip = 0
  private margin = 0
  private readonly from: number
  rtt = 200

  constructor(start: Timeline, readonly side: Side, readonly round: number, delay: number, target: number, public sink: WireSink, readonly t0: number) {
    this.session = new RollbackSession(start, side, delay)
    this.from = start.frame
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
    const moved = this.skip > 0 ? (this.skip--, false) : this.session.advance({ x: quantizeTilt(tiltX), y: quantizeTilt(tiltY), sp: this.sp }, out)
    this.flush()
    return moved
  }

  private get live(): boolean { return this.session.confirmed.frame > this.from + this.session.delay }

  onFrames(m: Extract<WireMsg, { op: 'frames' }>): ConfirmResult | null {
    if (m.round !== (this.round & 255)) return null
    const result = this.session.confirm(m.first, m.frames)
    for (const c of this.session.takeCheckpoints()) this.sink.send({ op: 'hash', round: this.round & 255, frame: c.frame, hash: c.hash })
    this.margin = m.margin
    if (this.live) this.clock.onMargin(m.margin)
    return result
  }

  steer(now: number): number {
    const s = this.session
    if (this.done) return 0
    const err = clockFrame(now, this.t0, this.rtt, this.clock.target, s.delay) - s.frame
    if (err > CLOCK.leapFrames || (err > 0 && this.live && this.margin < 0)) {
      this.skip = 0
      return Math.max(0, Math.min(err, ROLL.maxPredict - s.depth))
    }
    if (this.skip > 0 || (this.live && err < -CLOCK.leapFrames && this.margin > this.clock.target)) this.skip = Math.max(0, -err)
    return this.skip ? -this.skip : 0
  }

  resync(tl: Timeline): void {
    this.skip = 0
    this.session.resync(tl)
  }

  view(): BattleState { return this.session.view() }
}
