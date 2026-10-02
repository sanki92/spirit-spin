/** Swipe Rip: on-screen fallback when motion sensors are unavailable (spec §4.5). Same timing + RPM formula as the motion rip. */
import { composeRip, timingScore, type RipFail, type RipResult } from './rip'

export interface TouchSample { t: number; x: number; y: number } // ms, CSS px

const NORMAL_SPEED = 3 // screen-heights per second of a normal brisk swipe = 100% pull
const MIN_TRAVEL = 0.25 // fraction of screen height
const BANK_TAN = 0.364 // tan(20°)

export function scoreSwipe(points: readonly TouchSample[], launchAt: number, screenH: number): RipResult | RipFail {
  const first = points[0], last = points[points.length - 1]
  if (!first || !last || points.length < 2) return { ok: false, reason: 'no-pull' }
  const dx = last.x - first.x, dy = last.y - first.y
  if (dy < MIN_TRAVEL * screenH) return { ok: false, reason: 'no-pull' }

  let pathLen = 0
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] as TouchSample, b = points[i] as TouchSample
    pathLen += Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2)
  }
  const raw = Math.sqrt(dx * dx + dy * dy) / pathLen
  const straightness = Math.max(0, Math.min(1, (raw - 0.8) / 0.18))
  const seconds = Math.max(0.016, (last.t - first.t) / 1000)
  const pullRatio = dy / screenH / seconds / NORMAL_SPEED
  const roll = Math.abs(dx) / dy > BANK_TAN ? (dx > 0 ? 30 : -30) : 0
  return composeRip(timingScore(first.t - launchAt), straightness, pullRatio, roll, first.t)
}
