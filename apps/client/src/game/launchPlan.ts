export type LaunchTier = 'FAIL' | 'WEAK' | 'GOOD' | 'GREAT' | 'OVERSPIN' | 'PERFECT'

export interface LaunchPlan { flight: number; hang: number; wobble: number; impact: number; shake: number; punch: number }

export const KICK_MS = 110
export const SETTLE_MS = 140

export const LAUNCH_PLAN: Record<LaunchTier, LaunchPlan> = {
  FAIL: { flight: 560, hang: 1.4, wobble: 0.9, impact: 0.35, shake: 0, punch: 0 },
  WEAK: { flight: 520, hang: 1.6, wobble: 0.55, impact: 0.6, shake: 0, punch: 0 },
  GOOD: { flight: 420, hang: 2, wobble: 0.15, impact: 1, shake: 0.02, punch: 0 },
  GREAT: { flight: 340, hang: 2, wobble: 0.04, impact: 1.6, shake: 0.05, punch: 0.03 },
  OVERSPIN: { flight: 340, hang: 2, wobble: 0.7, impact: 1.6, shake: 0.05, punch: 0.03 },
  PERFECT: { flight: 660, hang: 3.4, wobble: 0, impact: 2.8, shake: 0.09, punch: 0.07 },
}

export function tierOf(r: { ok: boolean; quality?: string; overspin?: boolean }): LaunchTier {
  if (!r.ok) return 'FAIL'
  if (r.overspin) return 'OVERSPIN'
  return r.quality === 'PERFECT' || r.quality === 'GREAT' || r.quality === 'GOOD' ? r.quality : 'WEAK'
}

export function planFor(tier: LaunchTier, still: boolean): LaunchPlan {
  const p = LAUNCH_PLAN[tier]
  return still ? { ...p, flight: Math.min(p.flight, 380), hang: Math.min(p.hang, 2), shake: 0, punch: 0 } : p
}

export function launchDuration(plans: readonly LaunchPlan[]): number {
  return KICK_MS + Math.max(...plans.map(p => p.flight)) + SETTLE_MS
}

export function flightProgress(plan: LaunchPlan, ms: number): number {
  const t = Math.max(0, Math.min(1, (ms - KICK_MS) / plan.flight))
  return t ** plan.hang
}
