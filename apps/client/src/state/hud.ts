import type { BeastId, FinishKind, RipQuality } from '@spirit/core'
import { create } from 'zustand'

export type BattlePhase = 'idle' | 'grip' | 'countdown' | 'coach' | 'launch' | 'battle' | 'roundEnd' | 'matchEnd' | 'paused'
export type Countdown = '3' | '2' | '1' | 'LAUNCH' | null
export interface Callout { quality: RipQuality | 'OVERSPIN' | 'FAIL'; rpm: number; note?: string }
export interface Lesson {
  id: string
  title: string
  text: string
  target?: string
  arrow?: '←' | '→' | '↑' | '↓'
  tap?: string
}

export type Banner = FinishKind | 'victory' | 'defeat' | 'vs' | 'spiritCall' | 'shout' | null

export interface HudState {
  phase: BattlePhase
  countdown: Countdown
  round: number
  scores: [number, number]
  spin: [number, number]
  guard: [number, number]
  gauge: [number, number]
  spiritActive: [boolean, boolean]
  summon: 0 | 1 | 'both' | null
  refused: number
  callout: Callout | null
  banner: Banner
  cutin: { beast: BeastId; side: 0 | 1; hesitate: boolean } | null
  shoutLevel: number
  inputMode: 'motion' | 'swipe'
  safetyPause: boolean
  notice: string | null
  announcer: { id: string; text: string; face: 'hyped' | 'laughing' | 'pointing' | 'serious' | 'shocked' | 'thumbs-up' } | null
  cine: boolean
  pull: number
  coach: boolean
  coachTip: { title: string; text: string } | null
  lesson: Lesson | null
  lessonTaps: number
  lessonSkip: number
  training: boolean
  set: (p: Partial<HudState>) => void
}

export const spiritReady = (s: Pick<HudState, 'gauge' | 'phase' | 'spiritActive'>): boolean => s.gauge[0] >= 1 && s.phase === 'battle' && !s.spiritActive[1]

export const spiritRefused = (s: Pick<HudState, 'gauge' | 'phase' | 'spiritActive'>): boolean => s.gauge[0] >= 1 && s.phase === 'battle' && s.spiritActive[1]

export const useHud = create<HudState>(set => ({
  phase: 'idle',
  countdown: null,
  round: 1,
  scores: [0, 0],
  spin: [0, 0],
  guard: [1, 1],
  gauge: [0, 0],
  spiritActive: [false, false],
  summon: null,
  refused: 0,
  callout: null,
  banner: null,
  cutin: null,
  shoutLevel: 0,
  inputMode: 'swipe',
  safetyPause: false,
  notice: null,
  announcer: null,
  cine: false,
  pull: 0,
  coach: false,
  coachTip: null,
  lesson: null,
  lessonTaps: 0,
  lessonSkip: 0,
  training: false,
  set: p => set(p),
}))

export const summonReset = { summon: null, refused: 0 } as const
