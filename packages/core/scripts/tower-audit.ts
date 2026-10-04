import { playMatch } from '../src/balance'
import { assembleTop, BLADES, DISCS, ROOKIE_BUILDS, STARTER_BEASTS, TIPS, type BeastId, type TopBuild } from '../src/parts'
import { createRng, rngNext } from '../src/rng'
import { dropFloor, PART_DROPS, towerFloor, TOWER_FLOORS } from '../src/tower'

const PLAYER = { skill: Number(process.env.SKILL ?? 0.6), aggression: 0.6, reaction: 30 }
const SEARCH = Number(process.env.SEARCH ?? 40), TRIALS = Number(process.env.TRIALS ?? 20), FINAL = Number(process.env.FINAL ?? 200)
const BLOCKER = 0.35

function available(floor: number) {
  const blades = new Set<string>(), discs = new Set<string>(), tips = new Set<string>()
  for (const b of STARTER_BEASTS) { blades.add(ROOKIE_BUILDS[b].bladeId); discs.add(ROOKIE_BUILDS[b].discId); tips.add(ROOKIE_BUILDS[b].tipId) }
  for (const [f, d] of Object.entries(PART_DROPS)) if (Number(f) < floor) (d.kind === 'blade' ? blades : d.kind === 'disc' ? discs : tips).add(d.id)
  for (const id of Object.keys(BLADES)) if ((dropFloor('blade', id) ?? 0) < floor || dropFloor('blade', id) === null) blades.add(id)
  for (const id of Object.keys(DISCS)) if ((dropFloor('disc', id) ?? 0) < floor || dropFloor('disc', id) === null) discs.add(id)
  for (const id of Object.keys(TIPS)) if ((dropFloor('tip', id) ?? 0) < floor || dropFloor('tip', id) === null) tips.add(id)
  const beasts: BeastId[] = [...STARTER_BEASTS, ...(floor > 40 ? ['zephyra' as BeastId] : [])]
  return { blades: [...blades], discs: [...discs], tips: [...tips], beasts }
}

function winRate(build: TopBuild, floor: number, n: number, seed: number): number {
  const f = towerFloor(floor)
  const specs = [assembleTop(build), assembleTop(f.opponent)] as const
  const rng = createRng(seed)
  let wins = 0
  for (let i = 0; i < n; i++) if (playMatch([specs[0], specs[1]], [PLAYER, f.brain], rng).winner === 0) wins++
  return wins / n
}

const rows: { floor: number; best: number; build: string; boss: string | null }[] = []
for (let floor = 1; floor <= TOWER_FLOORS; floor++) {
  const av = available(floor)
  const rng = createRng(floor * 7919)
  const pick = <T,>(xs: T[]) => xs[Math.floor(rngNext(rng) * xs.length)]!
  const candidates: TopBuild[] = av.beasts.map(b => ({ ...ROOKIE_BUILDS[b], beastId: b }))
  for (let i = 0; i < SEARCH; i++) candidates.push({ bladeId: pick(av.blades), discId: pick(av.discs), tipId: pick(av.tips), beastId: pick(av.beasts) })
  let best = candidates[0]!, bestRate = -1
  for (const [i, c] of candidates.entries()) {
    const r = winRate(c, floor, TRIALS, floor * 131 + i)
    if (r > bestRate) { bestRate = r; best = c }
  }
  const final = winRate(best, floor, FINAL, floor * 977)
  rows.push({ floor, best: final, build: `${best.beastId}/${best.bladeId}/${best.discId}/${best.tipId}`, boss: towerFloor(floor).boss })
  console.log(`floor ${String(floor).padStart(2)} ${towerFloor(floor).boss ? `[${towerFloor(floor).boss}]`.padEnd(8) : '        '} best ${(final * 100).toFixed(0).padStart(3)}%  ${rows.at(-1)!.build}${final < BLOCKER ? '  <-- BLOCKER' : ''}`)
}
const blockers = rows.filter(r => r.best < BLOCKER)
console.log(JSON.stringify({ skill: PLAYER.skill, blockers: blockers.map(b => b.floor), worst: rows.reduce((a, b) => (b.best < a.best ? b : a)) }))
