import { createBattle, ROUND_TICKS, stepBattle, TUNING, type BattleEvent, type RoundOutcome, type TickInput } from './battle'
import { botInput, type BotBrain } from './bot'
import { applyRound, newMatch, type MatchState } from './match'
import { NET, type RipView } from './net'
import type { TopSpec } from './parts'
import { swipePlausible, tracePlausible } from './plausibility'
import { composeRip, rpmQuality, scoreRip, type MotionSample, type RipResult } from './rip'
import { scoreSwipe, type TouchSample } from './rip-swipe'
import { createRng, type RngState } from './rng'

export interface RipPayload { motion?: MotionSample[] | undefined; swipe?: { points: TouchSample[]; h: number } | undefined; pull100: number }
export interface GhostRound { rip: RipResult; inputs: TickInput[] }

const clamp = (v: number, lo: number, hi: number) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : lo)
const FAIL = (): RipResult => composeRip(0.15, 0.3, 0.45, 0, 0)

export const toView = (r: RipResult, ok: boolean, reason: string | null): RipView => ({
  ok, reason, rpm: r.rpm, quality: r.quality, overspin: r.overspin, style: r.style, bankDir: r.bankDir, timing: r.timing, straightness: r.straightness, pullRatio: r.pullRatio,
})

export function judgeRip(msg: RipPayload): { rip: RipResult; view: RipView } {
  const motion = msg.motion?.length ? (tracePlausible(msg.motion).ok ? scoreRip(msg.motion, 0, { pull100: clamp(msg.pull100, 5, 12) }) : { ok: false as const, reason: 'no-pull' as const }) : null
  const rawSwipe = !motion && msg.swipe?.points.length ? (swipePlausible(msg.swipe.points) ? scoreSwipe(msg.swipe.points, 0, clamp(msg.swipe.h, 400, 1400)) : { ok: false as const, reason: 'no-pull' as const }) : null
  const swipe = rawSwipe?.ok && rawSwipe.rpm > NET.swipeRpmCap ? { ...rawSwipe, rpm: NET.swipeRpmCap, quality: rpmQuality(NET.swipeRpmCap) } : rawSwipe
  const best = [motion, swipe].find((r): r is RipResult => !!r?.ok)
  if (best) return { rip: best, view: toView(best, true, null) }
  const fail = FAIL()
  const reason = motion && !motion.ok ? motion.reason : swipe && !swipe.ok ? swipe.reason : 'no-pull'
  return { rip: fail, view: toView(fail, false, reason) }
}

export const quantize = (i: TickInput): TickInput => ({ tiltX: Math.round(clamp(i.tiltX, -1, 1) * 100) / 100, tiltY: Math.round(clamp(i.tiltY, -1, 1) * 100) / 100, spirit: i.spirit })

export function encodeInputs(ticks: readonly TickInput[]): number[] {
  const out: number[] = []
  for (const t of ticks) {
    const x = Math.round(t.tiltX * 100), y = Math.round(t.tiltY * 100), s = t.spirit ? 1 : 0
    const n = out.length
    if (n && out[n - 4] === x && out[n - 3] === y && out[n - 2] === s) out[n - 1]!++
    else out.push(x, y, s, 1)
  }
  return out
}

export const MAX_ROUND_INPUTS = ROUND_TICKS + 10 + 2 * (TUNING.summonTicks + TUNING.takeoverTicks)

export function inputTicks(enc: readonly number[]): number {
  let n = 0
  for (let i = 3; i < enc.length; i += 4) n += Math.max(0, Math.floor(Number.isFinite(enc[i]!) ? enc[i]! : 0))
  return n
}

export function decodeInputs(enc: readonly number[], maxTicks = MAX_ROUND_INPUTS): TickInput[] {
  const out: TickInput[] = []
  for (let i = 0; i + 3 < enc.length && out.length < maxTicks; i += 4) {
    const t = { tiltX: clamp(enc[i]!, -100, 100) / 100, tiltY: clamp(enc[i + 1]!, -100, 100) / 100, spirit: enc[i + 2] === 1 }
    const count = Math.min(Math.max(0, Math.floor(enc[i + 3]!)), maxTicks - out.length)
    for (let k = 0; k < count; k++) out.push(t)
  }
  return out
}

export function ghostBrain(h: { rips: readonly RipView[]; aggression: number }): BotBrain {
  const ok = h.rips.filter(r => r.ok)
  const avg = ok.length ? ok.reduce((a, r) => a + r.rpm, 0) / ok.length : 10500
  const skill = clamp((avg - 5000) / 9000, 0.15, 0.95)
  return { skill, aggression: clamp(Number.isFinite(h.aggression) ? h.aggression : 0.5, 0.1, 0.95), reaction: Math.round(40 - skill * 30) }
}

export function ghostRip(rips: readonly RipView[], round: number): RipResult {
  const r = rips.length ? rips[(round - 1) % rips.length]! : null
  if (!r) return composeRip(0.75, 0.75, 0.75, 0, 0)
  if (!r.ok) return FAIL()
  return { ok: true, rpm: r.rpm, quality: r.quality, overspin: r.overspin, style: r.style, bankDir: r.bankDir, timing: r.timing, straightness: r.straightness, pullRatio: r.pullRatio, startT: 0 }
}

export function deckTop<T>(deck: T | readonly T[], round: number): T {
  return Array.isArray(deck) ? (deck as readonly T[])[(round - 1) % (deck as readonly T[]).length]! : (deck as T)
}

export function deckValid(builds: readonly { bladeId: string; discId: string; tipId: string }[]): boolean {
  if (builds.length !== 3) return false
  const parts = builds.flatMap(b => [`b:${b.bladeId}`, `d:${b.discId}`, `t:${b.tipId}`])
  return new Set(parts).size === parts.length
}

export function ghostSeeds(seed: number): { battle: (round: number) => number; bot: RngState } {
  return { battle: round => (seed + round * 7919) >>> 0, bot: createRng((seed ^ 0x9e3779b9) >>> 0) }
}

export function replayMatch(o: { player: TopSpec | readonly TopSpec[]; ghost: TopSpec | readonly TopSpec[]; brain: BotBrain; ghostRips: readonly RipView[]; seed: number; rounds: readonly GhostRound[] }): { match: MatchState; outcomes: RoundOutcome[]; ticks: number[]; complete: boolean; consistent: boolean } {
  const seeds = ghostSeeds(o.seed)
  const ev: BattleEvent[] = []
  let match = newMatch()
  const outcomes: RoundOutcome[] = []
  const ticks: number[] = []
  for (let r = 1; r <= o.rounds.length && match.winner === null; r++) {
    const round = o.rounds[r - 1]!
    const b = createBattle([deckTop(o.player, r), deckTop(o.ghost, r)], [{ rip: round.rip, hesitate: false }, { rip: ghostRip(o.ghostRips, r), hesitate: false }], seeds.battle(r))
    const idle = round.inputs.at(-1) ?? { tiltX: 0, tiltY: 0, spirit: false }
    while (!b.outcome) {
      const inp = round.inputs[b.tick] ?? { ...idle, spirit: false }
      stepBattle(b, [quantize(inp), botInput(b, 1, o.brain, seeds.bot)], ev)
      ev.length = 0
    }
    outcomes.push(b.outcome)
    ticks.push(b.tick)
    match = applyRound(match, b.outcome)
  }
  const consistent = ticks.length === o.rounds.length && ticks.every((t, i) => o.rounds[i]!.inputs.length === t)
  return { match, outcomes, ticks, complete: match.winner !== null, consistent }
}

export interface GhostSide { deck: readonly TopSpec[]; rips: readonly RipView[]; brain: BotBrain }

export function simulateGhosts(a: GhostSide, b: GhostSide, seed: number): MatchState {
  const seeds = ghostSeeds(seed)
  const botA = createRng((seed ^ 0x51ed270b) >>> 0)
  const ev: BattleEvent[] = []
  let match = newMatch()
  for (let r = 1; match.winner === null && r <= 40; r++) {
    const s = createBattle([deckTop(a.deck, r), deckTop(b.deck, r)], [{ rip: ghostRip(a.rips, r), hesitate: false }, { rip: ghostRip(b.rips, r), hesitate: false }], seeds.battle(r))
    while (!s.outcome) {
      stepBattle(s, [botInput(s, 0, a.brain, botA), botInput(s, 1, b.brain, seeds.bot)], ev)
      ev.length = 0
    }
    match = applyRound(match, s.outcome)
  }
  return match
}
