/** Top-vs-top clash and top-vs-wall/pocket resolution. Only + - * / and sqrt: bit-identical across engines. */
import type { TopSpec } from '../parts'
import { isTideOn } from './technique'
import { T, POCKETS, POCKET_COS, TYPE_EDGE } from './tuning'
import type { BattleEvent, BattleState, Side, TopState } from './types'

const atk = (s: TopSpec) => 0.6 + 0.08 * s.stats.attack
const def = (s: TopSpec) => 0.6 + 0.08 * s.stats.defense

export function resolveWall(t: TopState, spec: TopSpec, side: Side, tick: number, out: BattleEvent[]): void {
  const grace = tick <= (t.overspinTicks > 0 ? T.launchGraceTicks / 2 : T.launchGraceTicks)
  const d = Math.sqrt(t.x * t.x + t.y * t.y)
  if (d + spec.radius <= 1 || d === 0) return
  const nx = t.x / d, ny = t.y / d
  const vn = t.vx * nx + t.vy * ny
  let inPocket = false
  for (const [px, py] of POCKETS) if (nx * px + ny * py > POCKET_COS) inPocket = true
  const knocked = tick - t.lastHitTick <= T.knockWindowTicks || t.wobble > 0.5
  const ringV = T.ringoutV * (spec.trait && spec.beastId === 'aegiron' ? T.tech.bedrock : 1)
  if (inPocket && vn > ringV && !grace && knocked) { t.out = true; return }
  t.x = nx * (1 - spec.radius); t.y = ny * (1 - spec.radius)
  if (vn > 0) {
    t.vx -= (1 + T.wallE) * vn * nx; t.vy -= (1 + T.wallE) * vn * ny
    t.spin -= T.wallSpinLoss * vn
    out.push({ k: 'wall', tick, side })
  }
}

export function resolveClash(s: BattleState, out: BattleEvent[]): void {
  const [a, b] = s.tops, [sa, sb] = s.specs
  if (a.phaseTicks > 0 || b.phaseTicks > 0) return
  const X = T.tech
  const dx = b.x - a.x, dy = b.y - a.y
  const dist = Math.sqrt(dx * dx + dy * dy)
  const minD = sa.radius + sb.radius
  if (dist >= minD || dist === 0) return
  const nx = dx / dist, ny = dy / dist

  const ma = sa.mass * (a.shieldTicks > 0 ? T.bastionMass : 1) * (a.pullTicks > 0 ? X.pullMass : 1)
  const mb = sb.mass * (b.shieldTicks > 0 ? T.bastionMass : 1) * (b.pullTicks > 0 ? X.pullMass : 1)
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
  if (a.strikeArmed) { kAonB *= a.strikeMul; shatterMulB = T.strikeShatterMul }
  if (b.strikeArmed) { kBonA *= b.strikeMul; shatterMulA = T.strikeShatterMul }
  if (b.shieldTicks > 0 && !a.strikeArmed) { kAonB *= T.bastionTaken; kBonA *= sb.ultimate ? X.reflectUlt : T.bastionReflect }
  if (a.shieldTicks > 0 && !b.strikeArmed) { kBonA *= T.bastionTaken; kAonB *= sa.ultimate ? X.reflectUlt : T.bastionReflect }
  if (isTideOn(a, sa) && !b.strikeArmed) kBonA *= T.tideGuard
  if (isTideOn(b, sb) && !a.strikeArmed) kAonB *= T.tideGuard
  if (a.pullTicks > 0 && b.shieldTicks <= 0) kAonB *= X.pullClash
  if (b.pullTicks > 0 && a.shieldTicks <= 0) kBonA *= X.pullClash
  if (sa.trait && sa.beastId === 'umbrax' && !a.ambushUsed) { kAonB *= X.ambush; a.ambushUsed = true }
  if (sb.trait && sb.beastId === 'umbrax' && !b.ambushUsed) { kBonA *= X.ambush; b.ambushUsed = true }
  if (sa.trait && sa.beastId === 'agnyx' && a.spin < X.embersSpin) kAonB *= X.embersAtk
  if (sb.trait && sb.beastId === 'agnyx' && b.spin < X.embersSpin) kBonA *= X.embersAtk

  a.vx -= (nx * base * kBonA) / ma; a.vy -= (ny * base * kBonA) / ma
  b.vx += (nx * base * kAonB) / mb; b.vy += (ny * base * kAonB) / mb

  // Damage is what each side *receives*: closing speed x how hard the other's hit lands. Asymmetric by design.
  const impactA = -vn * kBonA, impactB = -vn * kAonB
  const friction = T.clashFriction * (a.spin + b.spin)
  a.spin -= (T.clashSpinLoss * impactA + friction) * (sa.type === 'attack' ? T.attackMomentum : 1)
  b.spin -= (T.clashSpinLoss * impactB + friction) * (sb.type === 'attack' ? T.attackMomentum : 1)
  if (a.stealArmed) { const st = T.turnSteal * (sa.ultimate ? X.stealUlt : 1) * (b.shieldTicks > 0 ? 0.5 : 1); a.spin += st; b.spin -= st; if (sa.ultimate) b.burnTicks = X.burnTicks; a.stealArmed = false }
  if (b.stealArmed) { const st = T.turnSteal * (sb.ultimate ? X.stealUlt : 1) * (a.shieldTicks > 0 ? 0.5 : 1); b.spin += st; a.spin -= st; if (sb.ultimate) a.burnTicks = X.burnTicks; b.stealArmed = false }
  if (a.strikeArmed) { a.strikes--; a.strikeArmed = a.strikes > 0 }
  if (b.strikeArmed) { b.strikes--; b.strikeArmed = b.strikes > 0 }

  // Shatter is cumulative: one hit adds at most shatterCap (doubled for a Surge Strike), so finishes take a few big hits.
  a.shatter += Math.min(T.shatterCap * shatterMulA, (Math.max(0, impactA - T.shatterMin) * T.shatterGain * shatterMulA) / (0.4 + 0.15 * sa.shatterRes))
  b.shatter += Math.min(T.shatterCap * shatterMulB, (Math.max(0, impactB - T.shatterMin) * T.shatterGain * shatterMulB) / (0.4 + 0.15 * sb.shatterRes))
  if (a.shatter >= 1) a.shattered = true
  if (b.shatter >= 1) b.shattered = true

  const energy = -vn + 0.3 * (a.spin + b.spin)
  a.gauge = Math.min(1, a.gauge + T.gaugeClash * energy * (sa.trait && sa.beastId === 'voltfang' ? X.staticCharge : 1))
  b.gauge = Math.min(1, b.gauge + T.gaugeClash * energy * (sb.trait && sb.beastId === 'voltfang' ? X.staticCharge : 1))
  out.push({ k: 'clash', tick: s.tick, energy, x: a.x + nx * sa.radius, y: a.y + ny * sa.radius })
}
