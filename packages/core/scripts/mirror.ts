import { createBattle, stepBattle, type BattleEvent } from '../src/battle'
import { botInput, botRip, BOT_LEVELS } from '../src/bot'
import { assembleTop, STARTER_BUILDS } from '../src/parts'
import { createRng } from '../src/rng'
const rng = createRng(1), br = BOT_LEVELS.hard
const sp = assembleTop(STARTER_BUILDS.nagara)
for (let k = 0; k < 3; k++) {
  const s = createBattle([sp, sp], [{ rip: botRip(rng, br, sp), hesitate: false }, { rip: botRip(rng, br, sp), hesitate: false }], k)
  const ev: BattleEvent[] = []; let clashes = 0
  while (!s.outcome) { stepBattle(s, [botInput(s, 0, br, rng), botInput(s, 1, br, rng)], ev); clashes += ev.filter(e => e.k === 'clash').length; ev.length = 0 }
  console.log((s.tick / 60).toFixed(1), 's clashes', clashes, s.tops.map(t => `spin=${t.spin.toFixed(3)} sh=${t.shatter.toFixed(2)} out=${t.out} st=${t.stopped} shat=${t.shattered} pos=(${t.x.toFixed(2)},${t.y.toFixed(2)})`).join(' | '))
}
