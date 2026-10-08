import { createBattle, stepBattle, TICK_HZ, type BattleEvent, type TickInput } from '../src/battle'
import { botInput, botRip, BOT_LEVELS, type BotBrain } from '../src/bot'
import { applyRound, newMatch } from '../src/match'
import { assembleTop, BEAST_IDS, ROOKIE_BUILDS, STARTER_BUILDS, type TopBuild } from '../src/parts'
import { createRng, rngNext } from '../src/rng'

const COUNTDOWN = 3.05, BETWEEN = 3.2
const tier = {
  newcomer: (b: TopBuild): TopBuild => ({ ...b, levels: { blade: 1, disc: 1, tip: 1 } }),
  mid: (b: TopBuild): TopBuild => ({ ...b, levels: { blade: 3, disc: 3, tip: 3 }, kit: { trait: true, ultimate: false } }),
  endgame: (b: TopBuild): TopBuild => ({ ...b, levels: { blade: 5, disc: 5, tip: 5 }, kit: { trait: true, ultimate: true } }),
}
const pick = { newcomer: ROOKIE_BUILDS, mid: STARTER_BUILDS, endgame: STARTER_BUILDS }
const q = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(p * (s.length - 1))]! }
for (const brainName of ['normal', 'hard'] as const) for (const t of ['newcomer', 'mid', 'endgame'] as const) {
  const rng = createRng(11), brain: BotBrain = BOT_LEVELS[brainName]
  const secs: number[] = [], firstSpirit: number[] = [], matchSecs: number[] = [], roundsPer: number[] = []
  const fin: Record<string, number> = {}
  let n = 0
  for (const a of BEAST_IDS) for (const b of BEAST_IDS) for (let i = 0; i < 8; i++) {
    const specs = [assembleTop(tier[t](pick[t][a])), assembleTop(tier[t](pick[t][b]))] as const
    let m = newMatch(), rounds = 0, total = 0
    while (m.winner === null && rounds < 30) {
      const s = createBattle([specs[0], specs[1]], [{ rip: botRip(rng, brain, specs[0]), hesitate: false }, { rip: botRip(rng, brain, specs[1]), hesitate: false }], Math.floor(rngNext(rng) * 2 ** 31))
      const ev: BattleEvent[] = []
      let spiritAt = -1
      while (!s.outcome) {
        const inp: [TickInput, TickInput] = [botInput(s, 0, brain, rng), botInput(s, 1, brain, rng)]
        stepBattle(s, inp, ev)
        if (spiritAt < 0 && s.tops.some(tp => tp.spiritTicks > 0)) spiritAt = s.tick / TICK_HZ
        ev.length = 0
      }
      const sec = s.tick / TICK_HZ
      secs.push(sec); if (spiritAt >= 0) firstSpirit.push(spiritAt)
      fin[s.outcome.finish] = (fin[s.outcome.finish] ?? 0) + 1; n++
      rounds++; total += COUNTDOWN + sec + BETWEEN
      const f = s.outcome.finish
      m = applyRound(m, { winner: s.outcome.winner, finish: f, points: f === 'spin' ? 1 : f === 'spirit' ? 3 : f === 'draw' ? 0 : 2 })
    }
    matchSecs.push(total); roundsPer.push(rounds)
  }
  const pct = (k: string) => `${k} ${Math.round(((fin[k] ?? 0) / n) * 100)}%`
  console.log(`${brainName.padEnd(6)} ${t.padEnd(8)} round p25/med/p75 ${q(secs, .25).toFixed(1)}/${q(secs, .5).toFixed(1)}/${q(secs, .75).toFixed(1)}s  under5s ${Math.round(secs.filter(x => x < 5).length / secs.length * 100)}%  spiritUsed ${Math.round(firstSpirit.length / n * 100)}% at med ${firstSpirit.length ? q(firstSpirit, .5).toFixed(1) : '-'}s | ${['spin', 'ringout', 'shatter', 'spirit', 'draw'].map(pct).join(' ')} | rounds/match ${q(roundsPer, .5)} match med ${q(matchSecs, .5).toFixed(0)}s (fighting ${(q(secs, .5) * q(roundsPer, .5)).toFixed(0)}s)`)
}
