import { createBattle, stepBattle, type BattleEvent } from '../src/battle'
import { botInput, botRip, BOT_LEVELS } from '../src/bot'
import { assembleTop, STARTER_BUILDS, type BeastId } from '../src/parts'
import { createRng } from '../src/rng'
const [a, b] = (process.argv.slice(2).length ? process.argv.slice(2) : ['voltfang', 'nagara']) as [BeastId, BeastId]
const rng = createRng(2), br = BOT_LEVELS.hard
let vs = [0, 0], ticks = 0, rounds = 0, clashes = 0, walls = 0, maxR = [0, 0], knockV: number[] = [], outs = 0
for (let i = 0; i < 100; i++) {
  const specs = [assembleTop(STARTER_BUILDS[a]), assembleTop(STARTER_BUILDS[b])] as [ReturnType<typeof assembleTop>, ReturnType<typeof assembleTop>]
  const s = createBattle(specs, [{ rip: botRip(rng, br, specs[0]), hesitate: false }, { rip: botRip(rng, br, specs[1]), hesitate: false }], i)
  const ev: BattleEvent[] = []; rounds++
  while (!s.outcome) {
    stepBattle(s, [botInput(s, 0, br, rng), botInput(s, 1, br, rng)], ev)
    for (const e of ev) { if (e.k === 'clash') { clashes++; knockV.push(Math.max(...s.tops.map(t => Math.hypot(t.vx, t.vy)))) } if (e.k === 'wall') walls++ }
    ev.length = 0
    ticks++; s.tops.forEach((t, j) => { maxR[j] = Math.max(maxR[j]!, Math.hypot(t.x, t.y)); vs[j]! += Math.hypot(t.vx, t.vy) })
  }
  if (s.outcome.finish === 'ringout' || s.outcome.finish === 'spirit') outs++
}
knockV.sort((x, y) => x - y)
console.log({ meanSpeed: vs.map(v => (v / ticks).toFixed(2)), secs: (ticks / 60 / rounds).toFixed(1), perRound: { clashes: clashes / rounds, walls: walls / rounds }, maxR, outs, knockV_p50: knockV[knockV.length >> 1]?.toFixed(2), knockV_p90: knockV[Math.floor(knockV.length * 0.9)]?.toFixed(2) })
