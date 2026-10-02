import { createBattle, stepBattle, type BattleEvent, type TickInput } from '../src/battle'
import { botRip, BOT_LEVELS } from '../src/bot'
import { assembleTop, STARTER_BUILDS } from '../src/parts'
import { createRng } from '../src/rng'
const rng = createRng(1), specs = [assembleTop(STARTER_BUILDS.voltfang), assembleTop(STARTER_BUILDS.nagara)] as [ReturnType<typeof assembleTop>, ReturnType<typeof assembleTop>]
const s = createBattle(specs, [{ rip: botRip(rng, BOT_LEVELS.hard, specs[0]), hesitate: false }, { rip: botRip(rng, BOT_LEVELS.hard, specs[1]), hesitate: false }], 1)
s.tops[1].x = 5 // park the opponent far away: measure free motion only
const idle: TickInput = { tiltX: 0, tiltY: 0, spirit: false }; const ev: BattleEvent[] = []
for (let i = 1; i <= 360; i++) { stepBattle(s, [idle, idle], ev); ev.length = 0; if (i % 30 === 0) { const t = s.tops[0]; console.log((i / 60).toFixed(1), 'r', Math.hypot(t.x, t.y).toFixed(2), 'v', Math.hypot(t.vx, t.vy).toFixed(2), 'spin', t.spin.toFixed(2)) } }
