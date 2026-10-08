import type { BattleEvent, RoundOutcome, Side } from '@spirit/core'

export interface SpiritSeen { spirit: [boolean, boolean]; summon: [boolean, boolean] }

export function spiritTransitions(tops: readonly { spiritTicks: number; summonTicks: number }[], tick: number, seen: SpiritSeen): BattleEvent[] {
  const out: BattleEvent[] = []
  for (let i = 0; i < 2; i++) {
    const side = i as Side, t = tops[i]!
    const on = t.spiritTicks > 0, summoning = on && t.summonTicks > 0
    if (on && !seen.spirit[i]) { seen.spirit[i] = true; seen.summon[i] = true; out.push({ k: 'spirit', tick, side }) }
    if (seen.summon[i] && !summoning) { seen.summon[i] = false; if (on) out.push({ k: 'takeover', tick, side }) }
    if (!on && seen.spirit[i]) { seen.spirit[i] = false; out.push({ k: 'spiritEnd', tick, side }) }
  }
  return out
}

export const takeoverOn = (t: { spiritTicks: number; summonTicks: number }, outcome: RoundOutcome | null): boolean => !outcome && t.spiritTicks > 0 && t.summonTicks === 0

export type Summon = Side | 'both' | null

export const summonStart = (s: Summon, side: Side): Summon => (s === null || s === side ? side : 'both')

export const summonEnd = (s: Summon, side: Side): Summon => (s === 'both' ? ((1 - side) as Side) : s === side ? null : s)

export const zoomAfterEnd = (before: Summon, after: Summon): Side | 'release' | null => (before === after ? null : after === null ? 'release' : before === 'both' ? (after as Side) : null)

export const summonFocus = (a: boolean, b: boolean): Summon => (a && b ? 'both' : a ? 0 : b ? 1 : null)

export const spectatorSees = (e: BattleEvent): boolean => e.k === 'clash' || e.k === 'wall' || e.k === 'beast'

const LEAD = 0.2
const LIFT = 0.95
const SINGLE = 0.5
const BOTH = 0.45

export interface Shot { x: number; y: number; z: number; amount: number }

export const AWAKE_SCALE = 1.25

export function beastShot(o: Shot, tops: readonly { x: number; y: number }[], side: Side | 'both', scale = 1): Shot {
  const a = tops[0]!, b = tops[1]!
  if (side === 'both') { o.x = (a.x + b.x) / 2; o.z = -(a.y + b.y) / 2 - LEAD / 2; o.amount = BOTH }
  else { const t = side === 0 ? a : b; o.x = t.x; o.z = -t.y - LEAD; o.amount = SINGLE }
  const grow = scale - 1
  o.amount *= 1 - grow * 1.6
  o.y = LIFT + grow * 0.8
  return o
}

export const reducedMotion = (): boolean => document.documentElement.classList.contains('reduce-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches
