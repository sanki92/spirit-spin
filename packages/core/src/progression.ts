import type { FinishKind } from './battle/types'

export interface MatchSummary {
  won: boolean
  perfectRips: number
  spiritCalls: number
  finishes: FinishKind[]
  comeback: boolean
}

export function matchRewards(m: MatchSummary): { coins: number; xp: number } {
  const finishBonus = m.finishes.filter(f => f === 'spirit' || f === 'shatter').length * 5
  const coins = (m.won ? 30 : 10) + Math.min(5, m.perfectRips) * 5 + finishBonus + (m.comeback ? 20 : 0)
  return { coins, xp: m.won ? 60 : 25 }
}

export function levelForXp(xp: number): number {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 50)) + 1
}

export function xpForLevel(level: number): number {
  return (level - 1) ** 2 * 50
}
