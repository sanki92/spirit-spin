import { createBattle, stepBattle, type BattleEvent } from '../src/battle'
import { botInput, botRip, BOT_LEVELS } from '../src/bot'
import { assembleTop, STARTER_BUILDS } from '../src/parts'
import { createRng } from '../src/rng'
const rng = createRng(1), br = BOT_LEVELS.hard
const specs = [assembleTop(STARTER_BUILDS.voltfang), assembleTop(STARTER_BUILDS.nagara)] as [ReturnType<typeof assembleTop>, ReturnType<typeof assembleTop>]
const s = createBattle(specs, [{ rip: botRip(rng, br, specs[0]), hesitate: false }, { rip: botRip(rng, br, specs[1]), hesitate: false }], 1)
const ev: BattleEvent[] = []
for (let i = 0; i < 150 && !s.outcome; i++) {
  const a = botInput(s, 0, br, rng)
  stepBattle(s, [a, botInput(s, 1, br, rng)], ev)
  if (i % 10 === 0) { const [t, f] = s.tops; console.log(i, `A(${t.x.toFixed(2)},${t.y.toFixed(2)}) v(${t.vx.toFixed(2)},${t.vy.toFixed(2)}) tilt(${a.tiltX.toFixed(2)},${a.tiltY.toFixed(2)})  B(${f.x.toFixed(2)},${f.y.toFixed(2)})`) }
  ev.length = 0
}
