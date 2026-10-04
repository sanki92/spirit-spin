import type { BattleEvent, BattleState, Side } from '../battle'
import { CLOCK, ClockControl, clockFrame } from './clock'
import type { Timeline } from './replay'
import { ROLL, RollbackSession, type ConfirmResult } from './session'
import { quantizeTilt, WIRE, type WireMsg } from './wire'

export interface WireSink { send(m: WireMsg): void }

export class NetDriver {
  readonly session: RollbackSession
  readonly clock: ClockControl
  private sp: number
  private skip = 0
  private margin = 0
  private snapped = false
  private waiting = false
  private repeat = 0
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
    const own = this.repeat > 0 ? (this.repeat--, this.session.confirmed.last[this.side]) : { x: quantizeTilt(tiltX), y: quantizeTilt(tiltY), sp: this.sp }
    const moved = this.waiting ? false : this.skip > 0 ? (this.skip--, false) : this.session.advance(own, out)
    this.flush()
    return moved
  }

  private get live(): boolean { return this.session.confirmed.frame > this.from + this.session.delay }

  onFrames(m: Extract<WireMsg, { op: 'frames' }>): ConfirmResult | null {
    if (m.round !== (this.round & 255)) return null
    const result = this.session.confirm(m.first, m.frames)
    if (result === 'jump') this.snapped = true, this.waiting = false
    for (const c of this.session.takeCheckpoints()) this.sink.send({ op: 'hash', round: this.round & 255, frame: c.frame, hash: c.hash })
    this.margin = m.margin
    if (this.live) this.clock.onMargin(m.margin)
    return result
  }

  steer(now: number): number {
    const s = this.session
    if (this.done) return 0
    const want = clockFrame(now, this.t0, this.rtt, this.clock.target, s.delay)
    const err = want - s.frame
    const lead = Math.ceil((this.rtt + this.clock.target) / WIRE.tickMs) + s.delay + CLOCK.slackFrames
    this.waiting = err > CLOCK.leapFrames && want - s.confirmed.frame > lead
    if (this.waiting) return 0
    const snapped = this.snapped
    this.snapped = false
    if (err > CLOCK.leapFrames || (err > 0 && (snapped || (this.live && this.margin < 0)))) {
      this.skip = 0
      const n = Math.max(0, Math.min(err, ROLL.maxPredict - s.depth))
      this.repeat = Math.min(n, Math.max(0, Math.floor((now + this.rtt / 2 - this.t0) / WIRE.tickMs) - (s.frame + s.delay)))
      return n
    }
    if (this.skip > 0 || (this.live && err < -CLOCK.leapFrames && this.margin > this.clock.target)) this.skip = Math.max(0, -err)
    return this.skip ? -this.skip : 0
  }

  resync(tl: Timeline): void {
    this.skip = 0
    this.waiting = false
    this.session.resync(tl)
  }

  view(): BattleState { return this.session.view() }
}
