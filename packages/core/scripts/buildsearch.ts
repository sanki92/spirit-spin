import { playMatch } from '../src/balance'
import { BOT_LEVELS } from '../src/bot'
import { assembleTop, BLADES, DISCS, STARTER_BUILDS, TIPS, type BeastId, type TopBuild } from '../src/parts'
import { createRng } from '../src/rng'
const beast = process.argv[2] as BeastId
const N = Number(process.argv[3] ?? 24)
const others = (Object.keys(STARTER_BUILDS) as BeastId[]).filter(b => b !== beast)
const br = BOT_LEVELS.hard
const rows: { build: string; min: number; max: number; avg: number; detail: string }[] = []
const blades = process.argv[4] ? process.argv[4].split(',') : Object.keys(BLADES)
for (const b of blades) for (const d of Object.keys(DISCS)) for (const t of Object.keys(TIPS)) {
  const build: TopBuild = { bladeId: b, discId: d, tipId: t, beastId: beast }
  const me = assembleTop(build)
  const rs = others.map(o => {
    const rng = createRng(11)
    const foe = assembleTop(STARTER_BUILDS[o])
    let w = 0
    for (let i = 0; i < N; i++) if (playMatch([me, foe], [br, br], rng).winner === 0) w++
    return w / N
  })
  rows.push({ build: `${b}/${d}/${t}`, min: rs.reduce((a, x) => a + Math.max(0, 0.27 - x) + Math.max(0, x - 0.73), 0), max: Math.max(...rs), avg: rs.reduce((a, x) => a + x, 0) / rs.length, detail: rs.map(x => (x * 100).toFixed(0)).join(' ') })
}
rows.sort((x, y) => x.min * 3 + Math.abs(0.5 - x.avg) - (y.min * 3 + Math.abs(0.5 - y.avg)))
console.log(beast, 'vs', others.join(' '))
for (const r of rows.slice(0, 8)) console.log(r.build.padEnd(26), 'pen', (r.min * 100).toFixed(0), 'avg', (r.avg * 100).toFixed(0), '|', r.detail)
