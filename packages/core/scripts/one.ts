import { playMatch } from '../src/balance'
import { BOT_LEVELS } from '../src/bot'
import { assembleTop, STARTER_BUILDS } from '../src/parts'
import { createRng } from '../src/rng'
const rng = createRng(1)
const specs = [assembleTop(STARTER_BUILDS.voltfang), assembleTop(STARTER_BUILDS.aegiron)] as [ReturnType<typeof assembleTop>, ReturnType<typeof assembleTop>]
const t0 = performance.now()
const r = playMatch(specs, [BOT_LEVELS.hard, BOT_LEVELS.hard], rng)
console.log(r.winner, r.rounds.map(x => `${x.finish}:${x.seconds.toFixed(1)}`).join(' '), (performance.now() - t0).toFixed(0), 'ms')
