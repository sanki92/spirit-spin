import type { BeastId, FinishKind, RipQuality } from '@spirit/core'
import { create } from 'zustand'
import type { Guide } from '../game/guide'
import type { Box } from '../game/spot'

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
  spot?: Box
}

export type Banner = FinishKind | 'victory' | 'defeat' | 'vs' | 'spiritCall' | 'shout' | null

export interface HudState {
  phase: BattlePhase
  countdown: Countdown
  round: number
  scores: [number, number]
  spin: [number, number]
  gauge: [number, number]
  spiritActive: [boolean, boolean]
  edge: [boolean, boolean]
  saved: { n: number; side: 0 | 1 } | null
  summon: 0 | 1 | 'both' | null
  refused: number
  callout: Callout | null
  banner: Banner
  cutin: { beast: BeastId; side: 0 | 1; hesitate: boolean } | null
  inputMode: 'motion' | 'swipe'
  safetyPause: boolean
  notice: string | null
  announcer: { id: string; text: string; face: 'hyped' | 'laughing' | 'pointing' | 'serious' | 'shocked' | 'thumbs-up' } | null
  cine: boolean
  pull: number
  coach: boolean
  coachTip: { title: string; text: string; now?: boolean } | null
  lesson: Lesson | null
  lessonTaps: number
  lessonSkip: number
  training: boolean
  guide: Guide | null
  set: (p: Partial<HudState>) => void
}

export const stickLive = (phase: BattlePhase, spectator: boolean): boolean => !spectator && (phase === 'launch' || phase === 'battle')

export const spiritReady = (s: Pick<HudState, 'gauge' | 'phase' | 'spiritActive'>): boolean => s.gauge[0] >= 1 && s.phase === 'battle' && !s.spiritActive[1]

export const spiritRefused = (s: Pick<HudState, 'gauge' | 'phase' | 'spiritActive'>): boolean => s.gauge[0] >= 1 && s.phase === 'battle' && s.spiritActive[1]

export function edgeFlags(tops: readonly { edgeTicks: number; out: boolean }[], prev: [boolean, boolean]): [boolean, boolean] {
  const a = tops[0]!.edgeTicks > 0 && !tops[0]!.out, b = tops[1]!.edgeTicks > 0 && !tops[1]!.out
  return a === prev[0] && b === prev[1] ? prev : [a, b]
}

export const useHud = create<HudState>(set => ({
  phase: 'idle',
  countdown: null,
  round: 1,
  scores: [0, 0],
  spin: [0, 0],
  gauge: [0, 0],
  spiritActive: [false, false],
  edge: [false, false],
  saved: null,
  summon: null,
  refused: 0,
  callout: null,
  banner: null,
  cutin: null,
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
  guide: null,
  set: p => set(p),
}))

export const summonReset = { summon: null, refused: 0 } as const
