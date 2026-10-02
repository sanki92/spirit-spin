import { BEAST_IDS, towerFloor, type BattleSummary, type BeastId, type BossId, type Change } from '@spirit/core'
import type { MatchResult } from '../game/BattleController'
import { useSave } from './save'

export interface Settlement { coins: number; xp: number; changes: Change[]; unlocked: BeastId | null; part: string | null }

export function settleMatch(result: MatchResult, floor: number | null, boss: BossId | null, opponentName: string): Settlement {
  const save = useSave.getState()
  const won = result.winner === 0
  const summary: BattleSummary = {
    won, comeback: result.comeback, finishes: result.finishes, perfectRips: result.perfectRips, overspins: result.overspins,
    spiritCalls: result.spiritCalls, aggression: result.aggression, boss, opponent: opponentName,
  }
  const firstClear = won && floor !== null && floor > save.tower
  const r = save.recordMatch({ won, perfectRips: result.perfectRips, spiritCalls: result.spiritCalls, finishes: result.finishes, comeback: result.comeback, bestRpm: result.bestRpm }, summary, floor)
  let unlocked: BeastId | null = null, part: string | null = null, bonus = 0
  if (firstClear && floor !== null) {
    const f = towerFloor(floor)
    bonus = f.reward.coins
    useSave.setState(s => ({ coins: s.coins + f.reward.coins }))
    if (f.reward.part) {
      useSave.getState().addPart(`${f.reward.part.kind}s` as 'blades' | 'discs' | 'tips', f.reward.part.id)
      part = `${f.reward.part.id} ${f.reward.part.kind}`
    }
    if (f.reward.unlocksBeastSlot) {
      const next = BEAST_IDS.find(id => !useSave.getState().beasts[id])
      if (next) {
        useSave.getState().unlockBeast(next)
        unlocked = next
      }
    }
  }
  return { coins: r.coins + bonus, xp: r.xp, changes: r.changes, unlocked, part }
}
