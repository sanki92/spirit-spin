import {
  applyRound, assembleTop, botInput, createBattle, deckTop, encodeInputs, ghostRip, ghostSeeds, judgeRip, newMatch, quantize, stepBattle,
  type BattleEvent, type BotBrain, type MatchState, type RipView, type TickInput, type TopBuild,
} from '@spirit/core'

export const DECK: TopBuild[] = [
  { bladeId: 'fang', discId: 'standard', tipId: 'flat', beastId: 'voltfang' },
  { bladeId: 'bastion', discId: 'heavy', tipId: 'ball', beastId: 'aegiron' },
  { bladeId: 'crescent', discId: 'rim', tipId: 'needle', beastId: 'nagara' },
]
export const SWIPE = { points: Array.from({ length: 11 }, (_, i) => ({ t: 10 + i * 16, x: 200 + (i % 2), y: 100 + i * 50 })), h: 800 }
export interface Issued { matchId: string; seed: number; deck?: TopBuild[]; opponent: { name: string; rating: number; deck: TopBuild[]; rips: RipView[]; brain: BotBrain } }
export const steer = (r: number, t: number): TickInput => ({ tiltX: Math.sin(t / 19 + r) * 0.8, tiltY: Math.cos(t / 29) * 0.6, spirit: t === 150 })

export function playGhost(s: Issued, deck: TopBuild[] = s.deck ?? DECK, drive = steer): { match: MatchState; rounds: { swipe: typeof SWIPE; pull100: number; inputs: number[] }[] } {
  const seeds = ghostSeeds(s.seed)
  const mine = deck.map(assembleTop), theirs = s.opponent.deck.map(assembleTop)
  let m = newMatch()
  const rounds: { swipe: typeof SWIPE; pull100: number; inputs: number[] }[] = []
  const ev: BattleEvent[] = []
  for (let r = 1; m.winner === null; r++) {
    const rip = judgeRip({ swipe: SWIPE, pull100: 7 }).rip
    const b = createBattle([deckTop(mine, r), deckTop(theirs, r)], [{ rip, hesitate: false }, { rip: ghostRip(s.opponent.rips, r), hesitate: false }], seeds.battle(r))
    const inputs: TickInput[] = []
    while (!b.outcome) {
      const q = quantize(drive(r, b.tick))
      inputs.push(q)
      stepBattle(b, [q, botInput(b, 1, s.opponent.brain, seeds.bot)], ev)
      ev.length = 0
    }
    m = applyRound(m, b.outcome)
    rounds.push({ swipe: SWIPE, pull100: 7, inputs: encodeInputs(inputs) })
  }
  return { match: m, rounds }
}
