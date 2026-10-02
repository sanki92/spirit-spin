import type { BeastId, FinishKind, RipQuality } from '@spirit/core'
import { create } from 'zustand'

export type BattlePhase = 'idle' | 'grip' | 'countdown' | 'launch' | 'battle' | 'roundEnd' | 'matchEnd' | 'paused'
export type Countdown = '3' | '2' | '1' | 'LAUNCH' | null
export interface Callout { quality: RipQuality | 'OVERSPIN' | 'FAIL'; rpm: number; note?: string }
export type Banner = FinishKind | 'victory' | 'defeat' | 'vs' | 'spiritCall' | 'shout' | null

export interface HudState {
  phase: BattlePhase
  countdown: Countdown
  round: number
  scores: [number, number]
  spin: [number, number]
  gauge: [number, number]
  spiritActive: [boolean, boolean]
  callout: Callout | null
  banner: Banner
  cutin: { beast: BeastId; side: 0 | 1; hesitate: boolean } | null
  shoutLevel: number
  inputMode: 'motion' | 'swipe'
  safetyPause: boolean
  set: (p: Partial<HudState>) => void
}

export const useHud = create<HudState>(set => ({
  phase: 'idle',
  countdown: null,
  round: 1,
  scores: [0, 0],
  spin: [0, 0],
  gauge: [0, 0],
  spiritActive: [false, false],
  callout: null,
  banner: null,
  cutin: null,
  shoutLevel: 0,
  inputMode: 'swipe',
  safetyPause: false,
  set: p => set(p),
}))
