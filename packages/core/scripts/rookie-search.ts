import { writeFileSync } from 'node:fs'
import { playMatch } from '../src/balance'
import { BOT_LEVELS } from '../src/bot'
import { assembleTop, BLADES, ROOKIE_BUILDS, STARTER_BEASTS, TIPS, type BeastId } from '../src/parts'
import { createRng, rngNext } from '../src/rng'

const WANT: Record<string, string> = { voltfang: 'attack', aegiron: 'defense', nagara: 'stamina', agnyx: 'balance' }
const DISCS = ['standard', 'heavy', 'rim', 'compact']
type P = { atk: number; def: number; sr: number; drive: number; decay: number; disc: string }
const ids = (b: BeastId) => ({ blade: ROOKIE_BUILDS[b].bladeId, tip: ROOKIE_BUILDS[b].tipId })
let cur: Record<string, P> = Object.fromEntries(STARTER_BEASTS.map(b => {
  const { blade, tip } = ids(b)
  return [b, { atk: BLADES[blade]!.attack, def: BLADES[blade]!.defense, sr: BLADES[blade]!.shatterRes, drive: TIPS[tip]!.driveMod, decay: TIPS[tip]!.decayMod, disc: ROOKIE_BUILDS[b].discId }]
}))
const apply = (ps: Record<string, P>) => {
  for (const b of STARTER_BEASTS) {
    const p = ps[b]!, { blade, tip } = ids(b)
    Object.assign(BLADES[blade]!, { attack: p.atk, defense: p.def, shatterRes: p.sr })
    Object.assign(TIPS[tip]!, { driveMod: p.drive, decayMod: p.decay })
    ROOKIE_BUILDS[b] = { ...ROOKIE_BUILDS[b], discId: p.disc }
  }
}
const N = Number(process.argv[2] ?? 40), ITERS = Number(process.argv[3] ?? 120)
function score(ps: Record<string, P>): { s: number; m: number[][] } {
  apply(ps)
  let s = 0
  for (const b of STARTER_BEASTS) {
    const sp = assembleTop(ROOKIE_BUILDS[b])
    if (sp.type !== WANT[b]) s += 5
    for (const v of Object.values(sp.stats)) s += Math.max(0, v - 7) * 3
    const tot = Object.values(sp.stats).reduce((a, x) => a + x, 0)
    s += Math.max(0, tot - 19) * 0.5 + Math.max(0, 14 - tot) * 0.5
  }
  const br = BOT_LEVELS.hard
  const m = STARTER_BEASTS.map(a => STARTER_BEASTS.map(c => {
    if (a === c) return 50
    let w = 0
    const rng = createRng(17)
    const A = assembleTop(ROOKIE_BUILDS[a]), C = assembleTop(ROOKIE_BUILDS[c])
    for (let i = 0; i < N; i++) if (playMatch([A, C], [br, br], rng).winner === 0) w++
    return Math.round((w / N) * 100)
  }))
  for (const row of m) for (const v of row) s += Math.max(0, Math.abs(v - 50) - 14) / 10
  return { s, m }
}
const rng = createRng(31)
let best = score(cur), bestP = structuredClone(cur)
console.log('start', best.s.toFixed(2), JSON.stringify(best.m))
for (let it = 0; it < ITERS && best.s > 0; it++) {
  const next = structuredClone(bestP)
  const b = STARTER_BEASTS[Math.floor(rngNext(rng) * 4)]!, p = next[b]!
  const k = Math.floor(rngNext(rng) * 6)
  const d = rngNext(rng) < 0.5 ? -1 : 1
  if (k === 0) p.atk = Math.max(1, Math.min(8, p.atk + d))
  if (k === 1) p.def = Math.max(1, Math.min(8, p.def + d))
  if (k === 2) p.sr = Math.max(1, Math.min(8, p.sr + d))
  if (k === 3) p.drive = Math.max(0.4, Math.min(1, +(p.drive + d * 0.05).toFixed(2)))
  if (k === 4) p.decay = Math.max(1, Math.min(1.3, +(p.decay + d * 0.03).toFixed(2)))
  if (k === 5) p.disc = DISCS[Math.floor(rngNext(rng) * DISCS.length)]!
  const r = score(next)
  if (r.s <= best.s) { best = r; bestP = next; console.log(it, r.s.toFixed(2), JSON.stringify(r.m)) }
}
writeFileSync('scripts/rookie.best.json', JSON.stringify({ score: best.s, params: bestP, matrix: best.m }, null, 1))
apply(bestP)
for (const b of STARTER_BEASTS) console.log(b, JSON.stringify(bestP[b]), JSON.stringify(assembleTop(ROOKIE_BUILDS[b]).stats))
