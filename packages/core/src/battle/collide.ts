/** Top-vs-top clash and top-vs-wall/pocket resolution. Only + - * / and sqrt: bit-identical across engines. */
import type { TopSpec } from '../parts'
import { T, POCKETS, POCKET_COS, TYPE_EDGE } from './tuning'
import type { BattleEvent, BattleState, Side, TopState } from './types'

const atk = (s: TopSpec) => 0.6 + 0.08 * s.stats.attack
const def = (s: TopSpec) => 0.6 + 0.08 * s.stats.defense

export function resolveWall(t: TopState, spec: TopSpec, side: Side, tick: number, out: BattleEvent[]): void {
  const grace = tick <= T.launchGraceTicks && t.overspinTicks === 0
  const d = Math.sqrt(t.x * t.x + t.y * t.y)
  if (d + spec.radius <= 1 || d === 0) return
  const nx = t.x / d, ny = t.y / d
  const vn = t.vx * nx + t.vy * ny
  let inPocket = false
  for (const [px, py] of POCKETS) if (nx * px + ny * py > POCKET_COS) inPocket = true
  const knocked = tick - t.lastHitTick <= T.knockWindowTicks || t.wobble > 0.5
  if (inPocket && vn > T.ringoutV && !grace && knocked) { t.out = true; return }
  t.x = nx * (1 - spec.radius); t.y = ny * (1 - spec.radius)
  if (vn > 0) {
    t.vx -= (1 + T.wallE) * vn * nx; t.vy -= (1 + T.wallE) * vn * ny
    t.spin -= T.wallSpinLoss * vn
    out.push({ k: 'wall', tick, side })
  }
}

export function resolveClash(s: BattleState, out: BattleEvent[]): void {
  const [a, b] = s.tops, [sa, sb] = s.specs
  const dx = b.x - a.x, dy = b.y - a.y
  const dist = Math.sqrt(dx * dx + dy * dy)
  const minD = sa.radius + sb.radius
  if (dist >= minD || dist === 0) return
  const nx = dx / dist, ny = dy / dist

  const ma = sa.mass * (a.spiritTicks > 0 && sa.type === 'defense' ? T.bastionMass : 1)
  const mb = sb.mass * (b.spiritTicks > 0 && sb.type === 'defense' ? T.bastionMass : 1)
  // Separate overlap by inverse mass.
  const overlap = minD - dist, inv = 1 / ma + 1 / mb
  a.x -= nx * overlap * (1 / ma) / inv; a.y -= ny * overlap * (1 / ma) / inv
  b.x += nx * overlap * (1 / mb) / inv; b.y += ny * overlap * (1 / mb) / inv

  const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny
  if (vn >= 0) return // already separating
  a.lastHitTick = s.tick
  b.lastHitTick = s.tick

  const base = (-(1 + T.clashE) * vn) / inv + T.recoil * (a.spin + b.spin) * 0.5
  // k = how hard each side's hit lands on the other.
  let kAonB = (atk(sa) / def(sb)) * TYPE_EDGE[sa.type][sb.type], kBonA = (atk(sb) / def(sa)) * TYPE_EDGE[sb.type][sa.type]
  let shatterMulB = 1, shatterMulA = 1
  if (a.strikeArmed) { kAonB *= sa.type === 'balance' ? T.turnMul : T.strikeMul; shatterMulB = T.strikeShatterMul }
  if (b.strikeArmed) { kBonA *= sb.type === 'balance' ? T.turnMul : T.strikeMul; shatterMulA = T.strikeShatterMul }
  if (b.spiritTicks > 0 && sb.type === 'defense') { kAonB *= T.bastionTaken; kBonA *= T.bastionReflect }
  if (a.spiritTicks > 0 && sa.type === 'defense') { kBonA *= T.bastionTaken; kAonB *= T.bastionReflect }
  if (a.spiritTicks > 0 && sa.type === 'stamina') kBonA *= T.tideGuard
  if (b.spiritTicks > 0 && sb.type === 'stamina') kAonB *= T.tideGuard

  a.vx -= (nx * base * kBonA) / ma; a.vy -= (ny * base * kBonA) / ma
  b.vx += (nx * base * kAonB) / mb; b.vy += (ny * base * kAonB) / mb

  // Damage is what each side *receives*: closing speed x how hard the other's hit lands. Asymmetric by design.
  const impactA = -vn * kBonA, impactB = -vn * kAonB
  const friction = T.clashFriction * (a.spin + b.spin)
  a.spin -= (T.clashSpinLoss * impactA + friction) * (sa.type === 'attack' ? T.attackMomentum : 1)
  b.spin -= (T.clashSpinLoss * impactB + friction) * (sb.type === 'attack' ? T.attackMomentum : 1)
  if (a.strikeArmed && sa.type === 'balance') { a.spin += T.turnSteal; b.spin -= T.turnSteal }
  if (b.strikeArmed && sb.type === 'balance') { b.spin += T.turnSteal; a.spin -= T.turnSteal }
  a.strikeArmed = false; b.strikeArmed = false

  // Shatter is cumulative: one hit adds at most shatterCap (doubled for a Surge Strike), so finishes take a few big hits.
  a.shatter += Math.min(T.shatterCap * shatterMulA, (Math.max(0, impactA - T.shatterMin) * T.shatterGain * shatterMulA) / (0.4 + 0.15 * sa.shatterRes))
  b.shatter += Math.min(T.shatterCap * shatterMulB, (Math.max(0, impactB - T.shatterMin) * T.shatterGain * shatterMulB) / (0.4 + 0.15 * sb.shatterRes))
  if (a.shatter >= 1) a.shattered = true
  if (b.shatter >= 1) b.shattered = true

  const energy = -vn + 0.3 * (a.spin + b.spin)
  a.gauge = Math.min(1, a.gauge + T.gaugeClash * energy)
  b.gauge = Math.min(1, b.gauge + T.gaugeClash * energy)
  out.push({ k: 'clash', tick: s.tick, energy, x: a.x + nx * sa.radius, y: a.y + ny * sa.radius })
}
