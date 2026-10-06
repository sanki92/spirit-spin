import type { MotionSample } from './rip'
import { createRng, rngRange } from './rng'

export interface PullOpts {
  launchAt?: number; start: number; accelMs?: number; decelMs?: number; peak?: number
  dir?: [number, number, number]; roll?: number; clip?: number; zigzag?: boolean; seed?: number; noPull?: boolean
  noise?: number; quantum?: number
}

/** 60 Hz trace (with timing jitter + sensor noise) of a yank: accelerate along dir, then brake. Spans launchAt-1200..+1200 ms. */
export function pullTrace(o: PullOpts): MotionSample[] {
  const launchAt = o.launchAt ?? 0, rng = createRng(o.seed ?? 7)
  const accelMs = o.accelMs ?? 130, decelMs = o.decelMs ?? 110, peak = o.peak ?? 30
  const [dx, dy, dz] = o.dir ?? [0, -1, 0]
  const n = o.noise ?? 0.3
  const q = (v: number) => (o.quantum ? Math.round(v / o.quantum) * o.quantum : v)
  const out: MotionSample[] = []
  for (let t = launchAt - 1200; t < launchAt + 1200; t += 1000 / 60 + rngRange(rng, -0.8, 0.8)) {
    let m = 0
    const u = t - o.start
    if (!o.noPull && u >= 0 && u < accelMs) m = peak * Math.sin((Math.PI * u) / accelMs)
    else if (!o.noPull && u >= accelMs && u < accelMs + decelMs) m = -peak * 0.8 * Math.sin((Math.PI * (u - accelMs)) / decelMs)
    if (o.clip !== undefined) m = Math.max(-o.clip, Math.min(o.clip, m))
    let ax = dx * m, ay = dy * m, az = dz * m
    if (o.zigzag && m !== 0 && Math.floor(u / 33) % 2 === 1) { const tmp = ax; ax = ay; ay = tmp; az = Math.abs(m) * 0.7 }
    out.push({ t, ax: q(ax + rngRange(rng, -n, n)), ay: q(ay + rngRange(rng, -n, n)), az: q(az + rngRange(rng, -n, n)),
      gx: q(rngRange(rng, -1, 1)), gy: q(rngRange(rng, -1, 1)), gz: q(rngRange(rng, -1, 1)), roll: o.roll ?? 2 })
  }
  return out
}
