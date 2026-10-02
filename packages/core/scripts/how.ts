import { playRound } from '../src/balance'
import { botRip, BOT_LEVELS } from '../src/bot'
import { assembleTop, STARTER_BUILDS, type BeastId } from '../src/parts'
import { createRng } from '../src/rng'
const [a, b] = process.argv.slice(2) as [BeastId, BeastId]
const rng = createRng(3), br = BOT_LEVELS.hard
const specs = [assembleTop(STARTER_BUILDS[a]), assembleTop(STARTER_BUILDS[b])] as [ReturnType<typeof assembleTop>, ReturnType<typeof assembleTop>]
const tally: Record<string, number> = {}; let secs = 0
for (let i = 0; i < 200; i++) { const r = playRound(specs, [botRip(rng, br, specs[0]), botRip(rng, br, specs[1])], [br, br], rng); const k = `${r.winner === 0 ? a : b} by ${r.finish}`; tally[k] = (tally[k] ?? 0) + 1; secs += r.seconds }
console.log(a, 'vs', b, tally, 'avg', (secs / 200).toFixed(1), 's', JSON.stringify(specs.map(s => s.stats)))
