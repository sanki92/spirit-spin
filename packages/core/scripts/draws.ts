import { createBattle, stepBattle, type BattleEvent } from '../src/battle'
import { botInput, botRip, BOT_LEVELS } from '../src/bot'
import { assembleTop, STARTER_BUILDS, BEAST_IDS } from '../src/parts'
import { createRng } from '../src/rng'
const rng = createRng(9), br = BOT_LEVELS.hard, tally: Record<string, number> = {}
for (let i = 0; i < 400; i++) {
  const a = BEAST_IDS[i % 4]!, b = BEAST_IDS[(i >> 2) % 4]!
  const specs = [assembleTop(STARTER_BUILDS[a]), assembleTop(STARTER_BUILDS[b])] as [ReturnType<typeof assembleTop>, ReturnType<typeof assembleTop>]
  const s = createBattle(specs, [{ rip: botRip(rng, br, specs[0]), hesitate: false }, { rip: botRip(rng, br, specs[1]), hesitate: false }], i)
  const ev: BattleEvent[] = []; let lastClash = -1
  while (!s.outcome) { stepBattle(s, [botInput(s, 0, br, rng), botInput(s, 1, br, rng)], ev); for (const e of ev) if (e.k === 'clash') lastClash = e.tick; ev.length = 0 }
  if (s.outcome.finish === 'draw') {
    const why = `t${(s.tick/60).toFixed(0)} ` + s.tops.map(t => (t.shattered ? 'sh' : t.out ? 'out' : t.stopped ? 'stop' : 'ok')).join('+') + (lastClash === s.tick ? ' @clash' : '')
    tally[why] = (tally[why] ?? 0) + 1
  }
}
console.log(tally)
