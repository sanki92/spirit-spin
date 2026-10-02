import { createBattle, stepBattle, type BattleEvent } from '../src/battle'
import { botInput, botRip, BOT_LEVELS } from '../src/bot'
import { assembleTop, STARTER_BUILDS, type BeastId } from '../src/parts'
import { createRng } from '../src/rng'
const [a, b] = process.argv.slice(2) as [BeastId, BeastId]
const rng = createRng(5), br = BOT_LEVELS.hard
const specs = [assembleTop(STARTER_BUILDS[a]), assembleTop(STARTER_BUILDS[b])] as [ReturnType<typeof assembleTop>, ReturnType<typeof assembleTop>]
let clashes = 0, rounds = 0, energies: number[] = [], shat = [0, 0], steer = 0, ticks = 0
for (let i = 0; i < 100; i++) {
  const s = createBattle(specs, [{ rip: botRip(rng, br, specs[0]), hesitate: false }, { rip: botRip(rng, br, specs[1]), hesitate: false }], i)
  const ev: BattleEvent[] = []; rounds++
  while (!s.outcome) { const inp = botInput(s, 0, br, rng); steer += Math.hypot(inp.tiltX, inp.tiltY); ticks++; stepBattle(s, [inp, botInput(s, 1, br, rng)], ev); for (const e of ev) if (e.k === 'clash') { clashes++; energies.push(e.energy) } ev.length = 0 }
  shat[0]! += s.tops[0].shatter; shat[1]! += s.tops[1].shatter
}
energies.sort((x, y) => x - y)
console.log({ clashesPerRound: clashes / rounds, eP50: energies[energies.length >> 1]?.toFixed(2), eP90: energies[Math.floor(energies.length * 0.9)]?.toFixed(2), avgShatterEnd: shat.map(v => (v / rounds).toFixed(2)), avgTilt: (steer / ticks).toFixed(2) })
