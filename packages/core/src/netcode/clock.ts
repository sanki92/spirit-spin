import { WIRE } from './wire'

export const CLOCK = { band: 5, small: 0.01, big: 0.03, jumpBelowMs: 0, aheadMs: 250, holdMs: 1000 } as const

const median = (xs: readonly number[]): number => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]! : 0)

export class RttStats {
  private xs: number[] = []

  add(ms: number): void {
    if (!Number.isFinite(ms) || ms < 0) return
    this.xs.push(ms)
    if (this.xs.length > 40) this.xs.shift()
  }

  get count(): number { return this.xs.length }
  get min(): number { return this.xs.length ? Math.min(...this.xs) : 0 }
  get rtt(): number { return median(this.xs) }
  get jitter(): number {
    const m = this.rtt
    return median(this.xs.map(v => Math.abs(v - m)))
  }
}

export function chooseDelay(rtt: number, jitter: number): 1 | 2 | 3 | 4 {
  if (jitter > 45 || rtt > 260) return 4
  if (jitter > 25 || rtt > 180) return 3
  if (rtt < 40 && jitter < 6) return 1
  return 2
}

export const targetMargin = (jitter: number): number => Math.min(100, 4 + 3 * WIRE.tickMs + 2 * Math.max(0, jitter))

export const beginAt = (t0: number, rtt: number, delay: number, target: number): number => t0 + (1 + delay) * WIRE.tickMs - rtt / 2 - target

export class ClockControl {
  scale = 1
  private holdUntil = -Infinity

  constructor(public target: number) {}

  hold(now: number): void {
    this.holdUntil = now + CLOCK.holdMs
    this.scale = 1
  }

  onMargin(margin: number, now: number, maxJump = Infinity, maxPause = Infinity): number {
    if (now < this.holdUntil) {
      this.scale = 1
      return 0
    }
    const err = margin - this.target
    if (margin < CLOCK.jumpBelowMs) {
      const n = Math.min(Math.ceil((this.target - margin) / WIRE.tickMs), maxJump)
      if (n > 0) {
        this.hold(now)
        return n
      }
    } else if (err > CLOCK.aheadMs) {
      const n = Math.min(Math.floor(err / WIRE.tickMs), maxPause)
      if (n > 0) {
        this.hold(now)
        return -n
      }
    }
    this.scale = err < -2 * CLOCK.band ? 1 + CLOCK.big : err < -CLOCK.band ? 1 + CLOCK.small : err > 4 * CLOCK.band ? 1 - CLOCK.big : err > CLOCK.band ? 1 - CLOCK.small : 1
    return 0
  }
}
