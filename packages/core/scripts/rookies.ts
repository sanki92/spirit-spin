import { playMatch } from '../src/balance'
import { BOT_LEVELS } from '../src/bot'
import { assembleTop, ROOKIE_BUILDS, STARTER_BEASTS, STARTER_BUILDS } from '../src/parts'
import { createRng } from '../src/rng'
for (const b of STARTER_BEASTS) { const r = assembleTop(ROOKIE_BUILDS[b]), s = assembleTop(STARTER_BUILDS[b]); console.log(b.padEnd(9), r.type.padEnd(8), JSON.stringify(r.stats), 'vs signature', JSON.stringify(s.stats)) }
const br = BOT_LEVELS.hard, N = Number(process.env.N ?? 60), SEED = Number(process.env.SEED ?? 9)
for (const a of STARTER_BEASTS) {
  const row = STARTER_BEASTS.map(b => { let w = 0; const rng = createRng(SEED); for (let i = 0; i < N; i++) if (playMatch([assembleTop(ROOKIE_BUILDS[a]), assembleTop(ROOKIE_BUILDS[b])], [br, br], rng).winner === 0) w++; return Math.round(w / N * 100) })
  console.log(a.padEnd(9), row.join('% ') + '%')
}
