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

export const summonFocus = (a: boolean, b: boolean): Summon => (a && b ? 'both' : a ? 0 : b ? 1 : null)

export const spectatorSees = (e: BattleEvent): boolean => e.k === 'clash' || e.k === 'wall' || e.k === 'beast'
