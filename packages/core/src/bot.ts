/**
 * Bot opponents: a rip generator and a per-tick steering brain. Deterministic given the rng, so the server can
 * replay bot matches and Tower floors exactly. Skill drives rip quality; aggression drives how hard it chases.
 */
import type { BattleState, Side, TickInput } from './battle/types'
import { POCKETS } from './battle/tuning'
import type { TopSpec } from './parts'
import { composeRip, type RipResult } from './rip'
import { rngNext, type RngState } from './rng'

export interface BotBrain {
  skill: number // 0..1: rip quality and steering precision
  aggression: number // 0..1: how much it chases the opponent
  reaction: number // mean ticks before it answers a full spirit gauge
}

export const BOT_LEVELS = {
  rookie: { skill: 0.2, aggression: 0.3, reaction: 90 },
  normal: { skill: 0.5, aggression: 0.5, reaction: 45 },
  hard: { skill: 0.8, aggression: 0.7, reaction: 20 },
  master: { skill: 1, aggression: 0.85, reaction: 8 },
} as const satisfies Record<string, BotBrain>

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)
/** Approx. normal(0,1) via Irwin–Hall (sum of 3 uniforms): no trig, deterministic. */
const gauss = (r: RngState) => (rngNext(r) + rngNext(r) + rngNext(r) - 1.5) * 2

export function botRip(rng: RngState, brain: BotBrain, spec: TopSpec): RipResult {
  const k = brain.skill, spread = 0.12 + (1 - k) * 0.3
  const timing = clamp(0.25 + 0.75 * k + gauss(rng) * spread, 0, 1)
  const straight = clamp(0.3 + 0.7 * k + gauss(rng) * spread, 0, 1)
  const overspin = rngNext(rng) < 0.15 * (1 - k) * (1 - k)
  const pullRatio = overspin ? 1.7 + rngNext(rng) * 0.4 : clamp(0.55 + 0.35 * k + gauss(rng) * 0.12, 0.2, 1.08)
  const bank = spec.type === 'attack' || spec.type === 'balance'
  const roll = bank ? (rngNext(rng) < 0.5 ? 30 : -30) : 0
  return composeRip(timing, straight, pullRatio, roll, 0)
}

export function botInput(s: BattleState, side: Side, brain: BotBrain, rng: RngState): TickInput {
  const t = s.tops[side], f = s.tops[(1 - side) as Side], spec = s.specs[side]
  // Aim where the opponent will be (lead by ~0.15 s), not where it is.
  const dx = f.x + f.vx * 0.15 - t.x, dy = f.y + f.vy * 0.15 - t.y
  const dist = Math.sqrt(dx * dx + dy * dy) || 1
  const r = Math.sqrt(t.x * t.x + t.y * t.y)
  let ix = 0, iy = 0

  const chase = spec.type === 'attack' || (spec.type === 'balance' && f.spin < t.spin)
  if (chase) { const k = 0.6 + 0.4 * brain.aggression; ix += (dx / dist) * k; iy += (dy / dist) * k }
  else if (r > 0.15) { ix -= (t.x / r) * 0.8; iy -= (t.y / r) * 0.8 }

  // Steer away from a pocket when close to the wall.
  if (r > 0.7) {
    for (const [px, py] of POCKETS) {
      if ((t.x / r) * px + (t.y / r) * py > 0.88) { ix -= (t.x / r) * 1.2; iy -= (t.y / r) * 1.2 }
    }
  }
  const noise = (1 - brain.skill) * 0.6
  ix = clamp((ix + (rngNext(rng) - 0.5) * noise) * (0.5 + 0.5 * brain.skill), -1, 1)
  iy = clamp((iy + (rngNext(rng) - 0.5) * noise) * (0.5 + 0.5 * brain.skill), -1, 1)

  const want: Record<string, boolean> = {
    voltfang: dist < 0.9, aegiron: dist < 0.6, nagara: dist < 0.8, agnyx: dist < 0.7, zephyra: dist < 0.9, umbrax: true,
  }
  const wantSpirit = t.gauge >= 1 && f.spiritTicks === 0 && (want[spec.beastId] ?? dist < 0.4)
  const spirit = wantSpirit && rngNext(rng) < 1 / Math.max(1, brain.reaction)
  return { tiltX: ix, tiltY: iy, spirit }
}
