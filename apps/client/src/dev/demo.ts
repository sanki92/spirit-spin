import type { MatchResult } from '../game/BattleController'
import type { Settlement } from '../state/settle'

export function demoResult(won: boolean): { result: MatchResult; settlement: Settlement; opponentName: string } {
  const w = won ? 0 : 1
  return {
    result: {
      winner: w,
      match: { round: 5, scores: won ? [4, 1] : [2, 4], winner: w, suddenDeath: false, history: won
        ? [{ winner: 0, finish: 'ringout', points: 2 }, { winner: 1, finish: 'spin', points: 1 }, { winner: 0, finish: 'spirit', points: 2 }]
        : [{ winner: 1, finish: 'shatter', points: 2 }, { winner: 0, finish: 'ringout', points: 2 }, { winner: 1, finish: 'spirit', points: 2 }] },
      bestRpm: 14000, spiritCalls: 2, comeback: false, perfectRips: 1, overspins: 0, finishes: won ? ['ringout', 'spirit'] : ['ringout'], aggression: 0.6,
    },
    settlement: { coins: 136, xp: 60, changes: [{ trait: 'trust', delta: 2, reason: 'Won together' }], unlocked: null, part: won ? 'Thunder Spiral blade' : null, shards: won ? 17 : 0, streak: won ? 3 : 0, streakCoins: won ? 27 : 0, levelUps: won ? 1 : 0 },
    opponentName: 'Floor 14 Spinner',
  }
}
