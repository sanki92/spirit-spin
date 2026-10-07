/** Swipe Rip: on-screen fallback when motion sensors are unavailable (spec §4.5). Same timing + RPM formula as the motion rip. */
import { composeRip, RIP, timingScore, type RipFail, type RipResult } from './rip'

export interface TouchSample { t: number; x: number; y: number } // ms, CSS px

const NORMAL_SPEED = 3 // screen-heights per second of a normal brisk swipe = 100% pull
const MIN_TRAVEL = 0.25 // fraction of screen height
const BANK_TAN = 0.364 // tan(20°)

export function scoreSwipe(points: readonly TouchSample[], launchAt: number, screenH: number): RipResult | RipFail {
  if (!(screenH > 0) || points.length < 2 || points.some(p => !Number.isFinite(p.t) || !Number.isFinite(p.x) || !Number.isFinite(p.y))) return { ok: false, reason: 'no-pull' }
  const origin = points[0] as TouchSample
  const moveIdx = points.findIndex(p => Math.abs(p.y - origin.y) > 0.02 * screenH || Math.abs(p.x - origin.x) > 0.02 * screenH)
  if (moveIdx < 0) return { ok: false, reason: 'no-pull' }
  const first = points[Math.max(0, moveIdx - 1)] as TouchSample
  const end = points[points.length - 1] as TouchSample
  const settle = points.findIndex((p, i) => i >= moveIdx && Math.abs(p.y - end.y) <= 0.02 * screenH && Math.abs(p.x - end.x) <= 0.02 * screenH)
  const last = points[settle] as TouchSample
  const dx = last.x - first.x, dy = last.y - first.y
  if (dy < MIN_TRAVEL * screenH) return { ok: false, reason: 'no-pull' }
  if (first.t < launchAt + RIP.earliestMs) return { ok: false, reason: 'too-early' }
  if (first.t > launchAt + RIP.latestMs) return { ok: false, reason: 'too-late' }
  let pathLen = 0
  for (let i = Math.max(1, moveIdx); i <= settle; i++) {
    const a = points[i - 1] as TouchSample, b = points[i] as TouchSample
    pathLen += Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2)
  }
  const raw = pathLen > 0 ? Math.sqrt(dx * dx + dy * dy) / pathLen : 0
  const straightness = Math.max(0, Math.min(1, (raw - 0.8) / 0.18))
  const seconds = Math.max(0.016, (last.t - first.t) / 1000)
  const pullRatio = dy / screenH / seconds / NORMAL_SPEED
  const roll = Math.abs(dx) / dy > BANK_TAN ? (dx > 0 ? 30 : -30) : 0
  return composeRip(timingScore(first.t - launchAt), straightness, pullRatio, roll, first.t)
}
