import { writeFileSync } from 'node:fs'
import { createBattle, stepBattle, type BattleEvent } from '../src/battle'
import { botInput, botRip, BOT_LEVELS } from '../src/bot'
import { assembleTop, STARTER_BUILDS, type BeastId } from '../src/parts'
import { createRng } from '../src/rng'
const [a, b, seed] = [process.argv[2] ?? 'voltfang', process.argv[3] ?? 'nagara', Number(process.argv[4] ?? 1)] as [BeastId, BeastId, number]
const rng = createRng(seed), br = BOT_LEVELS.hard
const specs = [assembleTop(STARTER_BUILDS[a]), assembleTop(STARTER_BUILDS[b])] as [ReturnType<typeof assembleTop>, ReturnType<typeof assembleTop>]
const s = createBattle(specs, [{ rip: botRip(rng, br, specs[0]), hesitate: false }, { rip: botRip(rng, br, specs[1]), hesitate: false }], seed)
const ev: BattleEvent[] = [], path: number[][] = [], clashes: number[][] = []
while (!s.outcome) {
  stepBattle(s, [botInput(s, 0, br, rng), botInput(s, 1, br, rng)], ev)
  for (const e of ev) if (e.k === 'clash') clashes.push([e.x, e.y]); ev.length = 0
  if (s.tick % 2 === 0) path.push([s.tops[0].x, s.tops[0].y, s.tops[1].x, s.tops[1].y])
}
writeFileSync(process.env.OUT ?? 'path.json', JSON.stringify({ path, clashes, outcome: s.outcome, secs: s.tick / 60, a, b }))
