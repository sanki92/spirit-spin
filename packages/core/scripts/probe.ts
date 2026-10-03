import { playMatch } from '../src/balance'
import { T, TYPE_EDGE } from '../src/battle/tuning'
import { BOT_LEVELS } from '../src/bot'
import { assembleTop, STARTER_BUILDS, type BeastId } from '../src/parts'
import { createRng } from '../src/rng'
const [a, b, ...mods] = process.argv.slice(2) as [BeastId, BeastId, ...string[]]
for (const m of mods) { const [k, v] = m.split('='); const path = k!.split('.'); let o: any = path[0] === 'edge' ? (path.shift(), TYPE_EDGE) : T; for (const p of path.slice(0, -1)) o = o[p]; o[path.at(-1)!] = Number(v) }
const ov = (id: BeastId) => { const e = process.env[`B_${id}`]; if (!e) return STARTER_BUILDS[id]; const [bladeId, discId, tipId] = e.split('/') as [string, string, string]; return { bladeId, discId, tipId, beastId: id } }
const sa = assembleTop(ov(a)), sb = assembleTop(ov(b)), br = BOT_LEVELS.hard
let w = 0, w2 = 0; const N = 120
let rng = createRng(5); for (let i = 0; i < N; i++) if (playMatch([sa, sb], [br, br], rng).winner === 0) w++
rng = createRng(6); for (let i = 0; i < N; i++) if (playMatch([sb, sa], [br, br], rng).winner === 1) w2++
console.log(`${a}>${b}`, ((w + w2) / (2 * N) * 100).toFixed(0) + '%', mods.join(' '))
