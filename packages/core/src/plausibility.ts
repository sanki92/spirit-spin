/**
 * Server-side anti-cheat for submitted rip traces (spec §13). Browsers have no sensor attestation, so we check
 * that a trace looks like real hardware: jittery timing, sensor noise, physical limits, no copy-pasted samples.
 */
import type { MotionSample } from './rip'
import type { TouchSample } from './rip-swipe'

export function tracePlausible(samples: readonly MotionSample[]): { ok: boolean; reasons: string[] } {
  const reasons: string[] = []
  const fields = (x: MotionSample) => [x.t, x.ax, x.ay, x.az, x.gx, x.gy, x.gz, x.roll]
  if (samples.some(x => fields(x).some(v => !Number.isFinite(v)))) return { ok: false, reasons: ['non-finite'] }
  for (let i = 1; i < samples.length; i++) if ((samples[i] as MotionSample).t <= (samples[i - 1] as MotionSample).t) { reasons.push('non-monotonic'); break }
  const first = samples[0], last = samples[samples.length - 1]
  const spanS = first && last ? (last.t - first.t) / 1000 : 0
  if (samples.length < 2 || samples.length / Math.max(spanS, 0.001) < 20) reasons.push('low-sample-rate')
  if (spanS < 0.9) reasons.push('short-span')

  const intervals: number[] = []
  for (let i = 1; i < samples.length; i++) intervals.push((samples[i] as MotionSample).t - (samples[i - 1] as MotionSample).t)
  if (stdev(intervals) < 0.2) reasons.push('no-interval-jitter')

  const rest = samples.filter(s => Math.sqrt(s.ax ** 2 + s.ay ** 2 + s.az ** 2) < 3).map(s => s.ax)
  if (rest.length < 6) reasons.push('no-rest-baseline')
  else if (stdev(rest) ** 2 <= 1e-4) reasons.push('no-sensor-noise')

  if (samples.some(s => Math.sqrt(s.ax ** 2 + s.ay ** 2 + s.az ** 2) > 160)) reasons.push('impossible-accel')

  let run = 1
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1] as MotionSample, b = samples[i] as MotionSample
    run = a.ax === b.ax && a.ay === b.ay && a.az === b.az ? run + 1 : 1
    if (run > 8) { reasons.push('repeated-samples'); break }
  }
  return { ok: reasons.length === 0, reasons }
}

function stdev(v: readonly number[]): number {
  if (v.length < 2) return 0
  const mean = v.reduce((a, b) => a + b, 0) / v.length
  return Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length)
}

export function swipePlausible(points: readonly TouchSample[]): boolean {
  if (points.length < 6) return false
  for (let i = 1; i < points.length; i++) {
    const dt = (points[i] as TouchSample).t - (points[i - 1] as TouchSample).t
    if (!(dt > 0) || dt > 120) return false
  }
  const span = (points[points.length - 1] as TouchSample).t - (points[0] as TouchSample).t
  return span >= 50 && span <= 900
}
