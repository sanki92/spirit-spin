import type { Countdown } from '../state/hud'

export type GuideMode = 'swipe' | 'timing' | 'steer'
export interface Guide { mode: GuideMode; dir?: '←' | '→' | '↑' | '↓'; small?: boolean; pill?: string }

export function thumbPose(mode: GuideMode, countdown: Countdown): 'loop' | 'hover' | 'flick' | 'hidden' {
  if (mode !== 'timing') return 'loop'
  if (countdown === 'LAUNCH') return 'flick'
  return countdown ? 'hover' : 'hidden'
}
