/**
 * Data-driven balance harness: bot-vs-bot simulation reporting round length, finish mix and matchup win rates.
 * Tuning changes in battle/tuning.ts must keep BALANCE_TARGETS green (spec pillars P1 and P3).
 */
import { createBattle, stepBattle, TICK_HZ, type BattleEvent, type FinishKind, type TickInput } from './battle'
import { botInput, botRip, type BotBrain } from './bot'
import { applyRound, newMatch } from './match'
import { assembleTop, BEAST_IDS, STARTER_BUILDS, type BeastId, type TopSpec } from './parts'
import type { RipResult } from './rip'
import { createRng, rngNext, type RngState } from './rng'

export interface RoundStat { seconds: number; finish: FinishKind; winner: 0 | 1 | null; timeout: boolean }

const IDLE: TickInput = { tiltX: 0, tiltY: 0, spirit: false }

export function playRound(specs: [TopSpec, TopSpec], rips: [RipResult, RipResult], brains: [BotBrain | null, BotBrain | null], rng: RngState): RoundStat {
  const s = createBattle(specs, [{ rip: rips[0], hesitate: false }, { rip: rips[1], hesitate: false }], Math.floor(rngNext(rng) * 2 ** 31))
  const ev: BattleEvent[] = []
  while (!s.outcome) {
    const a = brains[0] ? botInput(s, 0, brains[0], rng) : IDLE
    const b = brains[1] ? botInput(s, 1, brains[1], rng) : IDLE
    stepBattle(s, [a, b], ev)
    ev.length = 0
  }
  return { seconds: s.tick / TICK_HZ, finish: s.outcome.finish, winner: s.outcome.winner, timeout: s.tick >= 40 * TICK_HZ }
}

export function playMatch(specs: [TopSpec, TopSpec], brains: [BotBrain, BotBrain], rng: RngState): { winner: 0 | 1; rounds: RoundStat[] } {
  let m = newMatch()
  const rounds: RoundStat[] = []
  while (m.winner === null && rounds.length < 40) {
    const r = playRound(specs, [botRip(rng, brains[0], specs[0]), botRip(rng, brains[1], specs[1])], brains, rng)
    rounds.push(r)
    m = applyRound(m, { winner: r.winner, finish: r.finish, points: r.finish === 'spin' ? 1 : r.finish === 'spirit' ? 3 : r.finish === 'draw' ? 0 : 2 })
  }
  return { winner: m.winner ?? 0, rounds }
}

export interface BalanceReport {
  matchups: Record<string, number> // "voltfang>aegiron" -> win rate of the first
  meanRoundSeconds: number
  timeoutRate: number
  finishMix: Record<FinishKind, number>
  greatVsWeak: number // round win rate of a GREAT rip vs a WEAK rip, same top
  overspinVsGreat: number
}

const ripOf = (rpm: number, overspin = false): RipResult =>
  ({ ok: true, rpm, quality: 'GREAT', overspin, style: 'flat', bankDir: 0, timing: 1, straightness: 1, pullRatio: overspin ? 1.3 : 0.9, startT: 0 })

export function runBalance(matchesPerMatchup: number, brain: BotBrain, seed = 1): BalanceReport {
  const rng = createRng(seed)
  const specs = Object.fromEntries(BEAST_IDS.map(b => [b, assembleTop(STARTER_BUILDS[b])])) as Record<BeastId, TopSpec>
  const matchups: Record<string, number> = {}
  const all: RoundStat[] = []
  for (const a of BEAST_IDS) for (const b of BEAST_IDS) {
    let wins = 0
    for (let i = 0; i < matchesPerMatchup; i++) {
      // Alternate sides so launch position never biases results.
      const flip = i % 2 === 1
      const res = playMatch(flip ? [specs[b], specs[a]] : [specs[a], specs[b]], [brain, brain], rng)
      if ((res.winner === 0) !== flip) wins++
      all.push(...res.rounds)
    }
    matchups[`${a}>${b}`] = wins / matchesPerMatchup
  }
  const finishMix = { spin: 0, ringout: 0, shatter: 0, spirit: 0, draw: 0 } as Record<FinishKind, number>
  for (const r of all) finishMix[r.finish]++
  for (const k of Object.keys(finishMix) as FinishKind[]) finishMix[k] /= all.length

  const duel = (r0: RipResult, r1: RipResult) => {
    let w = 0
    const n = matchesPerMatchup * 4
    for (let i = 0; i < n; i++) {
      const beast = BEAST_IDS[i % 4] as BeastId
      const st = playRound([specs[beast], specs[beast]], [r0, r1], [brain, brain], rng)
      if (st.winner === 0) w++
    }
    return w / n
  }
  return {
    matchups,
    meanRoundSeconds: all.reduce((s, r) => s + r.seconds, 0) / all.length,
    timeoutRate: all.filter(r => r.timeout).length / all.length,
    finishMix,
    greatVsWeak: duel(ripOf(11500), ripOf(4500)),
    overspinVsGreat: duel(ripOf(13000, true), ripOf(11500)),
  }
}

export const BALANCE_TARGETS = {
  meanRoundSeconds: [8, 25],
  timeoutRate: [0, 0.1],
  matchup: [0.35, 0.65],
  mirror: [0.4, 0.6],
  finish: { spin: [0.2, 0.45], ringout: [0.2, 0.45], shatter: [0.08, 0.25], spirit: [0.05, 0.2] },
  greatVsWeak: [0.65, 1],
  overspinVsGreat: [0, 0.5],
} as const

export function balanceFailures(r: BalanceReport): string[] {
  const f: string[] = []
  const inR = (v: number, [lo, hi]: readonly [number, number]) => v >= lo && v <= hi
  const T = BALANCE_TARGETS
  if (!inR(r.meanRoundSeconds, T.meanRoundSeconds)) f.push(`meanRoundSeconds ${r.meanRoundSeconds.toFixed(1)}`)
  if (!inR(r.timeoutRate, T.timeoutRate)) f.push(`timeoutRate ${r.timeoutRate.toFixed(2)}`)
  for (const [k, v] of Object.entries(r.matchups)) {
    const [a, b] = k.split('>')
    if (!inR(v, a === b ? T.mirror : T.matchup)) f.push(`matchup ${k} ${v.toFixed(2)}`)
  }
  for (const [k, range] of Object.entries(T.finish)) {
    const v = r.finishMix[k as FinishKind]
    if (!inR(v, range)) f.push(`finish ${k} ${v.toFixed(2)}`)
  }
  if (!inR(r.greatVsWeak, T.greatVsWeak)) f.push(`greatVsWeak ${r.greatVsWeak.toFixed(2)}`)
  if (!inR(r.overspinVsGreat, T.overspinVsGreat)) f.push(`overspinVsGreat ${r.overspinVsGreat.toFixed(2)}`)
  return f
}
