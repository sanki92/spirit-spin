import { judgeRip, type MotionSample, type RipFail, type RipPayload, type RipResult, type TouchSample } from '@spirit/core'
import type { Callout } from '../state/hud'
import { FAIL_TEXT } from './BattleController'

export const RIP_BEFORE_MS = 400
export const RIP_AFTER_MS = 700
const r2 = (v: number) => Math.round(v * 100) / 100

export function ripPayload(t0: number, motion: readonly MotionSample[] | null, swipe: readonly TouchSample[] | null, pull100: number, pool: 'motion' | 'swipe' | 'any' = 'any'): RipPayload {
  const inWin = (t: number) => t >= t0 - RIP_BEFORE_MS && t <= t0 + RIP_AFTER_MS
  const m = (motion ?? []).filter(s => inWin(s.t)).map(s => ({ t: r2(s.t - t0), ax: r2(s.ax), ay: r2(s.ay), az: r2(s.az), gx: r2(s.gx), gy: r2(s.gy), gz: r2(s.gz), roll: r2(s.roll) }))
  const pts = (swipe ?? []).filter(p => inWin(p.t)).slice(-200)
  const sw = pts.length ? { points: pts.map(p => ({ t: r2(p.t - t0), x: r2(p.x), y: r2(p.y) })), h: Math.round(innerHeight) } : undefined
  if (pool === 'motion') return { motion: m, pull100 }
  if (pool === 'swipe') return { swipe: sw, pull100 }
  return { ...(m.length && !sw ? { motion: m } : {}), ...(sw ? { swipe: sw } : {}), pull100 }
}

export function judged(p: RipPayload): { res: RipResult | RipFail; rip: RipResult } {
  const j = judgeRip(p)
  const reason = (j.view.reason ?? 'no-pull') as RipFail['reason']
  return { res: j.view.ok ? j.rip : { ok: false, reason: reason in FAIL_TEXT ? reason : 'no-pull' }, rip: j.rip }
}

export function calloutOf(v: { ok: boolean; quality: Callout['quality']; overspin: boolean; rpm: number; reason?: string | null }): Callout {
  if (v.ok) return { quality: v.overspin ? 'OVERSPIN' : v.quality, rpm: v.rpm }
  const r = (v.reason ?? 'no-pull') as RipFail['reason']
  return { quality: 'FAIL', rpm: v.rpm, note: FAIL_TEXT[r] ?? FAIL_TEXT['no-pull'] }
}
