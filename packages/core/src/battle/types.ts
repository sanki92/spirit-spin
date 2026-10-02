import type { TopSpec } from '../parts'
import type { RipResult } from '../rip'
import type { RngState } from '../rng'

export interface TickInput { tiltX: number; tiltY: number; spirit: boolean }

export interface TopState {
  x: number; y: number; vx: number; vy: number
  spin: number // 0..~1.1
  wobble: number // 0..1
  shatter: number // 0..1, shattered at 1
  gauge: number // spirit gauge 0..1
  spiritTicks: number // > 0 while the beast is manifested
  strikeArmed: boolean // next clash gets the type's one-shot bonus (attack / balance)
  hesitate: boolean // beast will refuse its first call this round
  overspinTicks: number
  lastHitTick: number
  out: boolean; stopped: boolean; shattered: boolean
}

export type FinishKind = 'spin' | 'ringout' | 'shatter' | 'spirit' | 'draw'
export interface RoundOutcome { winner: 0 | 1 | null; finish: FinishKind; points: 0 | 1 | 2 | 3 }

export type Side = 0 | 1
export type BattleEvent =
  | { k: 'clash'; tick: number; energy: number; x: number; y: number }
  | { k: 'wall'; tick: number; side: Side }
  | { k: 'spirit'; tick: number; side: Side }
  | { k: 'hesitate'; tick: number; side: Side }
  | { k: 'spiritEnd'; tick: number; side: Side }
  | { k: 'finish'; tick: number; outcome: RoundOutcome }

export interface BattleState {
  tick: number
  rng: RngState
  specs: [TopSpec, TopSpec]
  tops: [TopState, TopState]
  outcome: RoundOutcome | null
}

export interface LaunchParams { rip: RipResult; hesitate: boolean }
