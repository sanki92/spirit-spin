/**
 * Rip (launch) scoring from a ~60 Hz motion trace (spec §4).
 * Phone accelerometers clip around 8g, so strength is the *integrated* pull over a fixed window, never the peak.
 */
export interface MotionSample {
  t: number // ms
  ax: number; ay: number; az: number // linear acceleration (gravity removed), m/s²
  gx: number; gy: number; gz: number // rotation rate, deg/s
  roll: number // phone roll, degrees
}
export interface Calibration { pull100: number } // integrated pull (m/s) of this player's normal rip
export const DEFAULT_CALIBRATION: Calibration = { pull100: 4 }

export type RipQuality = 'PERFECT' | 'GREAT' | 'GOOD' | 'WEAK'
export interface RipResult {
  ok: true
  rpm: number
  quality: RipQuality
  overspin: boolean
  style: 'flat' | 'bank'
  bankDir: -1 | 0 | 1
  timing: number // 0..1
  straightness: number // 0..1 (mapped)
  pullRatio: number // pull / calibration
  startT: number // ms
}
export interface RipFail { ok: false; reason: 'no-pull' | 'too-early' | 'too-late' }

export const RIP = {
  startThreshold: 12, // m/s² (~1.2g) marks the start of a pull
  windowMs: 250,
  earliestMs: -400, latestMs: 600, // accepted start window around the LAUNCH beat
  perfectMs: 80, zeroTimingMs: 280,
  bankRollDeg: 15,
  overspinRatio: 1.1,
  weights: { timing: 0.4, straightness: 0.35, pull: 0.25 },
  maxRpm: 15000,
} as const

const clamp01 = (v: number) => (Number.isFinite(v) ? (v < 0 ? 0 : v > 1 ? 1 : v) : 0)
const mag = (s: MotionSample) => Math.sqrt(s.ax * s.ax + s.ay * s.ay + s.az * s.az)

export function rpmQuality(rpm: number): RipQuality {
  return rpm >= 13000 ? 'PERFECT' : rpm >= 10000 ? 'GREAT' : rpm >= 6000 ? 'GOOD' : 'WEAK'
}

/** 0 below 30% of calibration, linear to 1 at 70%, flat above (overspin flagged separately). */
export function pullCurve(ratio: number): number {
  return clamp01((ratio - 0.3) / 0.4)
}

export function timingScore(offsetMs: number): number {
  return 1 - clamp01((Math.abs(offsetMs) - RIP.perfectMs) / (RIP.zeroTimingMs - RIP.perfectMs))
}

export function composeRip(timing: number, straightness: number, pullRatio: number, roll: number, startT: number): RipResult {
  const w = RIP.weights
  const score = w.timing * clamp01(timing) + w.straightness * clamp01(straightness) + w.pull * pullCurve(pullRatio)
  const rpm = Math.round((RIP.maxRpm * clamp01(score)) / 10) * 10
  const ratio = Number.isFinite(pullRatio) ? pullRatio : 0
  const bank = Number.isFinite(roll) && Math.abs(roll) >= RIP.bankRollDeg
  return {
    ok: true, rpm, quality: rpmQuality(rpm), overspin: ratio > RIP.overspinRatio,
    style: bank ? 'bank' : 'flat', bankDir: bank ? (roll > 0 ? 1 : -1) : 0,
    timing: clamp01(timing), straightness: clamp01(straightness), pullRatio: ratio, startT,
  }
}

export function scoreRip(samples: readonly MotionSample[], launchAt: number, cal: Calibration): RipResult | RipFail {
  const finite = (s: MotionSample) => Number.isFinite(s.t) && Number.isFinite(s.ax) && Number.isFinite(s.ay) && Number.isFinite(s.az) && Number.isFinite(s.roll)
  if (!Number.isFinite(cal.pull100) || cal.pull100 <= 0 || samples.some(s => !finite(s))) return { ok: false, reason: 'no-pull' }
  const lo = launchAt + RIP.earliestMs, hi = launchAt + RIP.latestMs
  const startIdx = samples.findIndex(s => s.t >= lo && s.t <= hi && mag(s) > RIP.startThreshold)
  if (startIdx < 0) {
    if (samples.some(s => s.t > hi && mag(s) > RIP.startThreshold)) return { ok: false, reason: 'too-late' }
    if (samples.some(s => s.t >= launchAt - 1000 && s.t < lo && mag(s) > RIP.startThreshold)) return { ok: false, reason: 'too-early' }
    return { ok: false, reason: 'no-pull' }
  }
  const start = samples[startIdx] as MotionSample

  // Integrate |a| over the window and accumulate sign-aligned vectors for axis consistency.
  // A yank accelerates then brakes, so samples are flipped into the peak's half-space before summing.
  let peak = start
  for (let i = startIdx; i < samples.length && (samples[i] as MotionSample).t < start.t + RIP.windowMs; i++) {
    const s = samples[i] as MotionSample
    if (mag(s) > mag(peak)) peak = s
  }
  let pull = 0, sumAbs = 0, vx = 0, vy = 0, vz = 0
  for (let i = startIdx; i < samples.length; i++) {
    const s = samples[i] as MotionSample
    if (s.t >= start.t + RIP.windowMs) break
    const prev = samples[i - 1]
    const dt = prev ? Math.min((s.t - prev.t) / 1000, 1 / 30) : 1 / 60
    const m = mag(s)
    pull += m * dt
    if (m < 3) continue // ignore rest noise for axis consistency
    const sign = s.ax * peak.ax + s.ay * peak.ay + s.az * peak.az >= 0 ? 1 : -1
    vx += sign * s.ax; vy += sign * s.ay; vz += sign * s.az
    sumAbs += m
  }
  const rawStraight = sumAbs > 0 ? Math.sqrt(vx * vx + vy * vy + vz * vz) / sumAbs : 0
  const straightness = clamp01((rawStraight - 0.55) / 0.4)
  return composeRip(timingScore(start.t - launchAt), straightness, pull / cal.pull100, start.roll, start.t)
}

export function calibrate(pulls: readonly number[]): Calibration {
  if (pulls.length === 0) return DEFAULT_CALIBRATION
  const sorted = [...pulls].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)] as number
  return { pull100: Math.max(1.5, Math.min(15, median)) }
}
