import { Replayer, startTimeline, tiltOf, timelineHash, WIRE, type BattleState, type Frame, type RoundOutcome, type Timeline } from '@spirit/core'

export class Verifier {
  readonly rp: Replayer
  readonly tilt = { sum: [0, 0] as [number, number], n: [0, 0] as [number, number] }
  desyncs = 0
  private hashes = new Map<number, number>()

  constructor(state: BattleState) {
    this.rp = new Replayer(startTimeline(state))
  }

  get tl(): Timeline { return this.rp.tl }
  get frame(): number { return this.rp.frame }
  get outcome(): RoundOutcome | null { return this.rp.tl.state.outcome }

  apply(first: number, frames: readonly Frame[]): void {
    this.rp.push(first, frames)
    while (!this.outcome && this.rp.stepOne([])) {
      const f = this.rp.tl.last
      for (const s of [0, 1] as const) {
        this.tilt.sum[s] += Math.min(1, Math.hypot(tiltOf(f[s].x), tiltOf(f[s].y)))
        this.tilt.n[s]++
      }
      if (this.rp.frame % WIRE.hashEvery === 0) {
        this.hashes.set(this.rp.frame, timelineHash(this.rp.tl))
        this.hashes.delete(this.rp.frame - WIRE.hashEvery * 20)
      }
    }
  }

  check(frame: number, hash: number): 'ok' | 'mismatch' | 'unknown' {
    const h = this.hashes.get(frame)
    if (h === undefined) return 'unknown'
    if (h === hash >>> 0) return 'ok'
    this.desyncs++
    return 'mismatch'
  }
}
