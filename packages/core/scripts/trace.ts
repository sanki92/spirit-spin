import { createBattle, stepBattle, type BattleEvent } from '../src/battle'
import { botInput, botRip, BOT_LEVELS } from '../src/bot'
import { assembleTop, STARTER_BUILDS, type BeastId } from '../src/parts'
import { createRng } from '../src/rng'
const [a, b] = (process.argv.slice(2).length ? process.argv.slice(2) : ['voltfang', 'aegiron']) as [BeastId, BeastId]
const specs = [assembleTop(STARTER_BUILDS[a]), assembleTop(STARTER_BUILDS[b])] as [ReturnType<typeof assembleTop>, ReturnType<typeof assembleTop>]
const rng = createRng(4), br = BOT_LEVELS.hard
const r0 = botRip(rng, br, specs[0]), r1 = botRip(rng, br, specs[1])
console.log('rips', r0.rpm, r0.style, r1.rpm, r1.style, 'stats', JSON.stringify(specs[0].stats), JSON.stringify(specs[1].stats))
const s = createBattle(specs, [{ rip: r0, hesitate: false }, { rip: r1, hesitate: false }], 4)
const ev: BattleEvent[] = []; let clashes = 0, walls = 0
while (!s.outcome) {
  stepBattle(s, [botInput(s, 0, br, rng), botInput(s, 1, br, rng)], ev)
  for (const e of ev) { if (e.k === "clash") { clashes++; if (process.env.V) console.log("  clash", (e.tick/60).toFixed(2), "E", e.energy.toFixed(2), "spins", s.tops.map(t=>t.spin.toFixed(2)).join("/"), "v", s.tops.map(t=>Math.hypot(t.vx,t.vy).toFixed(2)).join("/")) }; if (e.k === 'wall') walls++; if (e.k === 'spirit') console.log('spirit', e.side, (e.tick/60).toFixed(1)) }
  ev.length = 0
  if (s.tick % 60 === 0) console.log(`t=${s.tick / 60}s`, s.tops.map(t => `pos(${t.x.toFixed(2)},${t.y.toFixed(2)}) v=${Math.hypot(t.vx, t.vy).toFixed(2)} spin=${t.spin.toFixed(2)} sh=${t.shatter.toFixed(2)} g=${t.gauge.toFixed(2)}`).join(' | '))
}
console.log('outcome', JSON.stringify(s.outcome), 'at', (s.tick / 60).toFixed(1), 's clashes', clashes, 'walls', walls)
