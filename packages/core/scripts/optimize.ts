/** Hill-climbing search over tuning constants against BALANCE_TARGETS (common random numbers => deterministic objective). */
import { readFileSync, writeFileSync } from 'node:fs'
import { BALANCE_TARGETS, runBalance, type BalanceReport } from '../src/balance'
import { BOT_LEVELS } from '../src/bot'
import { T, TIP, TYPE_EDGE } from '../src/battle/tuning'
import { createRng, rngNext } from '../src/rng'

type P = { name: string; lo: number; hi: number; get: () => number; set: (v: number) => void }
const t = T as unknown as Record<string, number>
const tp = (k: keyof typeof T, lo: number, hi: number): P => ({ name: k, lo, hi, get: () => t[k]!, set: v => { t[k] = v } })
const tip = (kind: keyof typeof TIP, f: 'drive' | 'curve' | 'gain' | 'brake' | 'decay' | 'center', lo: number, hi: number): P =>
  ({ name: `${kind}.${f}`, lo, hi, get: () => TIP[kind][f], set: v => { TIP[kind][f] = v } })
const edge = (a: keyof typeof TYPE_EDGE, b: keyof typeof TYPE_EDGE, lo: number, hi: number): P =>
  ({ name: `edge.${a}.${b}`, lo, hi, get: () => TYPE_EDGE[a][b], set: v => { TYPE_EDGE[a][b] = v } })
const tech = T.tech as unknown as Record<string, number>
const xp = (k: keyof typeof T.tech, lo: number, hi: number): P => ({ name: `tech.${k}`, lo, hi, get: () => tech[k]!, set: v => { tech[k] = v } })
const PARAMS: P[] = [
  xp('stun', 30, 90), xp('pullForce', 0.5, 4.5), xp('pullClash', 1, 2.2), xp('pullMass', 1, 2.6), tp('bastionReflect', 0.8, 1.5), tp('bastionTaken', 0.2, 0.8), tp('turnSteal', 0.12, 0.35),
  xp('fangDash', 2, 4), xp('fangMul', 1.6, 3.4), xp('slamPush', 1, 4), xp('slamRange', 0.4, 1), xp('coilDrain', 0.05, 0.4), xp('coilPush', 0.5, 2.5), xp('diveV', 2, 4.5), xp('diveMul', 1, 3), xp('pull', 60, 120), xp('fling', 0.8, 2.6), xp('pounceMul', 1.4, 3.2), xp('pounceDash', 1.5, 3.2),
  edge('attack', 'stamina', 1, 1.6), edge('attack', 'defense', 0.5, 1), edge('defense', 'attack', 1, 1.6), edge('defense', 'stamina', 0.6, 1),
  edge('stamina', 'attack', 0.6, 1), edge('balance', 'defense', 0.9, 1.4), edge('balance', 'attack', 0.8, 1.3), edge('attack', 'balance', 0.8, 1.3),
  tp('shatterCap', 0.15, 0.6), tp('steerTurn', 1, 4), tp('overspinBonus', 0, 0.1), tp('bastionMass', 1.5, 4), tp('bastionReflect', 0.8, 1.5), tp('bastionTaken', 0.2, 0.8), tp('turnSteal', 0.12, 0.3), tp('overspinDrain', 0.04, 0.25), tp('wobbleForce', 0.5, 4), tp('overspinTicks', 60, 300),
  tip('ball', 'decay', 0.024, 0.045), tip('needle', 'decay', 0.012, 0.026),
  tip('ball', 'brake', 0.3, 2), tip('ball', 'gain', 1, 3.5), tip('semi', 'gain', 1, 3.5),
  tip('ball', 'center', 1, 2.2), tip('needle', 'center', 0.8, 2), tip('flat', 'decay', 0.035, 0.07), tip('semi', 'decay', 0.022, 0.045),
  tp('recoil', 0.2, 1.4), tp('clashE', 0.2, 0.75), tp('clashSpinLoss', 0.01, 0.09), tp('clashFriction', 0.001, 0.02),
  tp('shatterMin', 0.3, 1.6), tp('shatterGain', 0.1, 0.8), tp('ringoutV', 0.15, 0.9), tp('slope', 1.4, 3.2),
  tp('gaugePerSec', 0.05, 0.1), tp('gaugeClash', 0.08, 0.25), tp('wallSpinLoss', 0.005, 0.09), tp('spinFromRpm', 0.4, 0.8),
]
const inR = (v: number, [lo, hi]: readonly [number, number]) => (v < lo ? (lo - v) / (hi - lo || 1) : v > hi ? (v - hi) / (hi - lo || 1) : 0)
function score(r: BalanceReport): number {
  const B = BALANCE_TARGETS
  let s = inR(r.meanRoundSeconds, B.meanRoundSeconds) + 2 * inR(r.timeoutRate, B.timeoutRate)
  for (const [k, v] of Object.entries(r.matchups)) { const [a, b] = k.split('>'); s += 3 * inR(v, a === b ? B.mirror : B.matchup) }
  for (const [k, range] of Object.entries(B.finish)) s += 2 * inR(r.finishMix[k as keyof typeof r.finishMix], range)
  s += 3 * inR(r.finishMix.draw, [0, 0.06]) + 2 * inR(r.greatVsWeak, B.greatVsWeak) + 2 * inR(r.overspinVsGreat, B.overspinVsGreat)
  return s
}
if (process.argv[4]) for (const [k, v] of Object.entries(JSON.parse(readFileSync(process.argv[4], 'utf8')).params as Record<string, number>)) PARAMS.find(p => p.name === k)?.set(v)
if (process.argv[5] === 'tech-only') PARAMS.splice(19)
const N = Number(process.argv[2] ?? 14), ITERS = Number(process.argv[3] ?? 250)
const evalNow = () => score(runBalance(N, BOT_LEVELS.hard, 77))
const rng = createRng(2024)
let best = evalNow(), bestVals = PARAMS.map(p => p.get())
let cur = best, curVals = [...bestVals]
console.log('start', best.toFixed(3))
for (let it = 0; it < ITERS && best > 0; it++) {
  const step = 0.25 * (1 - it / ITERS) + 0.04
  const picks = 1 + Math.floor(rngNext(rng) * 3)
  for (let k = 0; k < picks; k++) {
    const p = PARAMS[Math.floor(rngNext(rng) * PARAMS.length)]!
    p.set(Math.min(p.hi, Math.max(p.lo, p.get() + (rngNext(rng) * 2 - 1) * step * (p.hi - p.lo))))
  }
  const sc = evalNow()
  const temp = 1.2 * (1 - it / ITERS)
  if (sc <= cur || rngNext(rng) < Math.exp((cur - sc) / Math.max(temp, 1e-3))) { cur = sc; curVals = PARAMS.map(p => p.get()) }
  else PARAMS.forEach((p, i) => p.set(curVals[i]!))
  if (sc < best) { best = sc; bestVals = PARAMS.map(p => p.get()); console.log(it, best.toFixed(3)); save() }
}
function save() {
  const out = Object.fromEntries(PARAMS.map((p, i) => [p.name, +bestVals[i]!.toFixed(4)]))
  writeFileSync('scripts/tuning.best.json', JSON.stringify({ score: best, params: out }, null, 1))
  return out
}
console.log('best', best.toFixed(3), save())
