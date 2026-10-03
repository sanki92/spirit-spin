import { balanceFailures, runBalance } from '../src/balance'
import { BOT_LEVELS } from '../src/bot'

const n = Number(process.argv[2] ?? 100)
const level = (process.argv[3] ?? 'hard') as keyof typeof BOT_LEVELS
const t0 = performance.now()
const r = runBalance(n, BOT_LEVELS[level])
const pct = (v: number) => `${(v * 100).toFixed(0)}%`.padStart(5)
console.log(`\nBalance (${n} matches/matchup, bots=${level}) in ${((performance.now() - t0) / 1000).toFixed(1)}s`)
console.log(`mean round ${r.meanRoundSeconds.toFixed(1)}s  timeouts ${pct(r.timeoutRate)}`)
console.log('finishes', Object.entries(r.finishMix).map(([k, v]) => `${k} ${pct(v)}`).join('  '))
console.log(`GREAT vs WEAK ${pct(r.greatVsWeak)}   OVERSPIN vs GREAT ${pct(r.overspinVsGreat)}`)
const ids = ['voltfang', 'aegiron', 'nagara', 'agnyx', 'zephyra', 'umbrax']
console.log('\nrow beats col  ' + ids.map(i => i.slice(0, 8).padStart(9)).join(''))
for (const a of ids) console.log(a.padEnd(15) + ids.map(b => pct(r.matchups[`${a}>${b}`] ?? 0).padStart(9)).join(''))
const fails = balanceFailures(r)
console.log(fails.length ? `\nFAIL: ${fails.join(', ')}` : '\nALL TARGETS MET')
