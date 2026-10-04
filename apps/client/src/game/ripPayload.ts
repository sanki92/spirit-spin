import { judgeRip, type MotionSample, type RipFail, type RipPayload, type RipResult, type TouchSample } from '@spirit/core'
import type { Callout } from '../state/hud'
import { FAIL_TEXT } from './BattleController'

export const RIP_BEFORE_MS = 400
export const RIP_AFTER_MS = 850
const MIN_GAP_MS = 8
const r2 = (v: number) => Math.round(v * 100) / 100

function motionPart(t0: number, motion: readonly MotionSample[]): MotionSample[] {
  const out: MotionSample[] = []
  let last = -Infinity
  for (const s of motion) {
    if (s.t < t0 - RIP_BEFORE_MS || s.t > t0 + RIP_AFTER_MS) continue
    const t = r2(s.t - t0)
    if (t - last < MIN_GAP_MS) continue
    last = t
    out.push({ t, ax: r2(s.ax), ay: r2(s.ay), az: r2(s.az), gx: r2(s.gx), gy: r2(s.gy), gz: r2(s.gz), roll: r2(s.roll) })
  }
  return out
}

function swipePart(t0: number, swipe: readonly TouchSample[]): { points: TouchSample[]; h: number } | undefined {
  const pts = swipe.filter(p => p.t >= t0 - RIP_BEFORE_MS && p.t <= t0 + RIP_AFTER_MS)
  if (!pts.length) return undefined
  const h = Math.round(globalThis.innerHeight ?? 800)
  const o = pts[0]!
  const move = pts.findIndex(p => Math.abs(p.y - o.y) > 0.02 * h || Math.abs(p.x - o.x) > 0.02 * h)
  const from = move > 0 ? move - 1 : 0
  const kept: TouchSample[] = []
  let last = -Infinity
  for (const p of pts.slice(from).slice(-200)) {
    const t = r2(p.t - t0)
    if (t <= last) continue
    last = t
    kept.push({ t, x: r2(p.x), y: r2(p.y) })
  }
  return kept.length ? { points: kept, h } : undefined
}

export function ripPayload(t0: number, motion: readonly MotionSample[] | null, swipe: readonly TouchSample[] | null, pull100: number, pool: 'motion' | 'swipe' | 'any' = 'any'): RipPayload {
  const m = motionPart(t0, motion ?? [])
  const sw = swipePart(t0, swipe ?? [])
  if (pool === 'motion') return { motion: m, pull100 }
  if (pool === 'swipe') return { swipe: sw, pull100 }
  return { ...(m.length && !sw ? { motion: m } : {}), ...(sw ? { swipe: sw } : {}), pull100 }
}

export function judged(p: RipPayload): { res: RipResult | RipFail; rip: RipResult } {
  const j = judgeRip(p)
  const reason = (j.view.reason ?? 'no-pull') as RipFail['reason']
  return { res: j.view.ok ? j.rip : { ok: false, reason: reason in FAIL_TEXT ? reason : 'no-pull' }, rip: j.rip }
}

export function bestPayload(t0: number, motion: readonly MotionSample[] | null, swipe: readonly TouchSample[] | null, pull100: number, preferSwipe: boolean): RipPayload {
  const asMotion = motion?.length ? ripPayload(t0, motion, null, pull100) : null
  const asSwipe = swipe?.length ? ripPayload(t0, null, swipe, pull100) : null
  const order = (preferSwipe ? [asSwipe, asMotion] : [asMotion, asSwipe]).filter((p): p is RipPayload => !!p)
  const scored = order.map(p => ({ p, r: judged(p).res }))
  const ok = scored.filter(x => x.r.ok) as { p: RipPayload; r: RipResult }[]
  if (ok.length) return ok.sort((a, b) => b.r.rpm - a.r.rpm)[0]!.p
  return order[0] ?? { pull100 }
}

export function calloutOf(v: { ok: boolean; quality: Callout['quality']; overspin: boolean; rpm: number; reason?: string | null }): Callout {
  if (v.ok) return { quality: v.overspin ? 'OVERSPIN' : v.quality, rpm: v.rpm }
  const r = (v.reason ?? 'no-pull') as RipFail['reason']
  return { quality: 'FAIL', rpm: v.rpm, note: FAIL_TEXT[r] ?? FAIL_TEXT['no-pull'] }
}
