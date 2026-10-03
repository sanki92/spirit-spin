import { BLADES, DISCS, SHARDS, TIPS, STARTER_BEASTS, towerFloor, type BattleSummary, type BeastId, type BossId, type Change } from '@spirit/core'
import type { MatchResult } from '../game/BattleController'
import { todayKey, useSave } from './save'

export interface Settlement { coins: number; xp: number; changes: Change[]; unlocked: BeastId | null; part: string | null; shards: number }

export function settleMatch(result: MatchResult, floor: number | null, boss: BossId | null, opponentName: string): Settlement {
  const save = useSave.getState()
  const won = result.winner === 0
  const summary: BattleSummary = {
    won, comeback: result.comeback, finishes: result.finishes, perfectRips: result.perfectRips, overspins: result.overspins,
    spiritCalls: result.spiritCalls, aggression: result.aggression, boss, opponent: opponentName,
  }
  const firstClear = won && floor !== null && floor > save.tower
  const r = save.recordMatch({ won, perfectRips: result.perfectRips, spiritCalls: result.spiritCalls, finishes: result.finishes, comeback: result.comeback, bestRpm: result.bestRpm }, summary, floor)
  let unlocked: BeastId | null = null, part: string | null = null, bonus = 0, shards = 0
  if (won && useSave.getState().dailyWin !== todayKey()) {
    shards += SHARDS.dailyWin
    useSave.setState({ dailyWin: todayKey() })
  }
  if (firstClear && floor !== null) {
    const f = towerFloor(floor)
    bonus = f.reward.coins
    shards += f.reward.shards
    useSave.setState(s => ({ coins: s.coins + f.reward.coins }))
    if (f.reward.part) {
      useSave.getState().addPart(`${f.reward.part.kind}s` as 'blades' | 'discs' | 'tips', f.reward.part.id)
      const { kind, id } = f.reward.part
      part = `${(kind === 'blade' ? BLADES : kind === 'disc' ? DISCS : TIPS)[id]?.name ?? id} ${kind}`
    }
    if (f.reward.beast && !useSave.getState().beasts[f.reward.beast]) {
      useSave.getState().unlockBeast(f.reward.beast)
      unlocked = f.reward.beast
    } else if (f.reward.unlocksBeastSlot) {
      const next = STARTER_BEASTS.find(id => !useSave.getState().beasts[id])
      if (next) {
        useSave.getState().unlockBeast(next)
        unlocked = next
      }
    }
  }
  if (shards) useSave.getState().addShards(shards)
  return { coins: r.coins + bonus, xp: r.xp, changes: r.changes, unlocked, part, shards }
}
