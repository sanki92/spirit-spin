import { rngNext, type RngState } from '../rng'

export interface NetProfile { latency: number; jitter: number; loss: number; spikeEvery: number; spikeMs: number; ordered: boolean }

export const PROFILES = {
  lan: { latency: 3, jitter: 1, loss: 0, spikeEvery: 0, spikeMs: 0, ordered: false },
  criteria: { latency: 75, jitter: 15, loss: 0.05, spikeEvery: 0, spikeMs: 0, ordered: false },
  spikes: { latency: 40, jitter: 10, loss: 0.01, spikeEvery: 7000, spikeMs: 300, ordered: false },
  hotspot: { latency: 45, jitter: 25, loss: 0.02, spikeEvery: 9000, spikeMs: 200, ordered: false },
  tcp: { latency: 75, jitter: 15, loss: 0.02, spikeEvery: 0, spikeMs: 0, ordered: true },
} satisfies Record<string, NetProfile>

export class Link<T> {
  private q: { at: number; msg: T }[] = []
  private lastAt = 0

  constructor(private p: NetProfile, private rng: RngState) {}

  send(msg: T, now: number): void {
    let at = now + this.p.latency + rngNext(this.rng) * this.p.jitter
    if (this.p.spikeEvery > 0) {
      const ph = now % this.p.spikeEvery
      if (ph < this.p.spikeMs) at += this.p.spikeMs - ph
    }
    if (rngNext(this.rng) < this.p.loss) {
      if (!this.p.ordered) return
      at += 3 * this.p.latency + 200
    }
    if (this.p.ordered) at = Math.max(at, this.lastAt)
    this.lastAt = Math.max(this.lastAt, at)
    this.q.push({ at, msg })
  }

  recv(now: number): T[] {
    if (!this.q.length) return []
    const ready = this.q.filter(e => e.at <= now)
    if (!ready.length) return []
    this.q = this.q.filter(e => e.at > now)
    return ready.sort((a, b) => a.at - b.at).map(e => e.msg)
  }
}
