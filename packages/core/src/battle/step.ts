/** One fixed 60 Hz tick. Mutates state in place (zero allocation besides pushed events). */
import type { TopSpec } from '../parts'
import { rngNext } from '../rng'
import { resolveClash, resolveWall } from './collide'
import { updateSpirit } from './spirit'
import { tickTechnique } from './technique'
import { DT, ROUND_TICKS, T, TIP } from './tuning'
import type { BattleEvent, BattleState, RoundOutcome, Side, TickInput, TopState } from './types'

const clampTilt = (v: number) => (Number.isFinite(v) ? (v > 1 ? 1 : v < -1 ? -1 : v) : 0)

export function stepBattle(s: BattleState, inputs: readonly [TickInput, TickInput], out: BattleEvent[]): void {
  if (s.outcome) return
  s.tick++
  if (s.tops[0].summonTicks > 0 || s.tops[1].summonTicks > 0) {
    s.pausedTicks++
    for (let i = 0; i < 2; i++) {
      const t = s.tops[i as Side]
      if (t.summonTicks > 0 && --t.summonTicks === 0) out.push({ k: 'takeover', tick: s.tick, side: i as Side })
    }
    return
  }
  const out0 = s.tops[0].spiritTicks > 0, out1 = s.tops[1].spiritTicks > 0
  for (let i = 0; i < 2; i++) {
    const side = i as Side
    const t = s.tops[side], spec = s.specs[side], foe = s.tops[(1 - side) as Side]
    const raw = inputs[side]
    const held = t.stunTicks > 0 || (t.spiritTicks > 0 && t.summonTicks === 0)
    const input: TickInput = { tiltX: held ? 0 : clampTilt(raw.tiltX), tiltY: held ? 0 : clampTilt(raw.tiltY), spirit: raw.spirit === true }
    updateSpirit(t, spec, foe, input, side, s.tick, out, side === 0 ? out1 : out0)
    tickTechnique(t, spec, foe, side, s.tick, out)
    if (t.edgeTicks > 0) teeter(t, spec, input, side, s.tick, out)
    else moveTop(s, t, spec, input, foe)
  }
  resolveClash(s, out)
  for (let i = 0; i < 2; i++) resolveWall(s.tops[i as Side], s.specs[i as Side], i as Side, s.tick, out, s.tops[(1 - i) as Side])
  for (const t of s.tops) if (t.spin <= T.stopSpin) { t.spin = Math.max(t.spin, 0); t.stopped = true }

  const o = judge(s)
  if (o) { s.outcome = o; out.push({ k: 'finish', tick: s.tick, outcome: o }) }
}

function moveTop(s: BattleState, t: TopState, spec: TopSpec, input: TickInput, foe: TopState): void {
  const tip = TIP[spec.tip]
  const X = T.tech
  const centerMul = tip.center
  let ax = -T.slope * centerMul * t.x, ay = -T.slope * centerMul * t.y
  if (foe.pullTicks > 0) {
    const px = foe.x - t.x, py = foe.y - t.y, pl = Math.sqrt(px * px + py * py)
    if (pl > 1e-3) { ax += (px / pl) * X.pullForce; ay += (py / pl) * X.pullForce }
  }

  // Velocity controller. Desired velocity = cruise speed along (heading curved by grip + player tilt);
  // actual velocity relaxes toward it with the tip's grip, or only its sliding friction when knocked faster than cruise.
  const speed = Math.sqrt(t.vx * t.vx + t.vy * t.vy)
  let hx = speed > 1e-3 ? t.vx / speed : -t.y, hy = speed > 1e-3 ? t.vy / speed : t.x
  const hl = Math.sqrt(hx * hx + hy * hy); if (hl > 1e-6) { hx /= hl; hy /= hl } else { hx = 1; hy = 0 }
  const turn = tip.curve * DT // right spin curves clockwise
  let dx = hx + hy * turn + input.tiltX * T.steerTurn, dy = hy - hx * turn + input.tiltY * T.steerTurn
  const dl = Math.sqrt(dx * dx + dy * dy); if (dl > 1e-6) { dx /= dl; dy /= dl } else { dx = hx; dy = hy }
  const cruise = tip.drive * spec.driveMod * Math.max(t.spin, 0) * T.vmax * (0.5 + 0.05 * spec.stats.speed)
    * (t.stunTicks > 0 ? X.stunCruise : 1) * (spec.trait && spec.beastId === 'zephyra' ? X.tailwind : 1)
  const grip = (speed > cruise * 1.05 ? tip.brake : tip.gain) * (t.stunTicks > 0 ? X.stunGrip : 1)
  ax += (dx * cruise - t.vx) * grip
  ay += (dy * cruise - t.vy) * grip

  if (t.overspinTicks > 0) { t.overspinTicks--; t.wobble = Math.max(0, t.overspinTicks / Math.round(T.overspinTicks)); t.spin -= T.overspinDrain * DT }
  else if (t.spin < T.wobbleSpin) t.wobble = Math.max(t.wobble, (T.wobbleSpin - t.spin) / T.wobbleSpin)
  if (t.wobble > 0) {
    ax += (rngNext(s.rng) - 0.5) * 2 * T.wobbleForce * t.wobble
    ay += (rngNext(s.rng) - 0.5) * 2 * T.wobbleForce * t.wobble
  }

  ax += T.steer * input.tiltX; ay += T.steer * input.tiltY
  const tilt = Math.sqrt(input.tiltX * input.tiltX + input.tiltY * input.tiltY)
  const staminaFactor = (1.3 - 0.06 * spec.stats.stamina) * (spec.trait && spec.beastId === 'nagara' ? X.ebb : 1)
  t.spin -= ((tip.decay * spec.decayMod + T.drag * t.spin) * staminaFactor + T.steerCost * Math.min(tilt, 1)) * DT

  t.vx += ax * DT; t.vy += ay * DT
  t.x += t.vx * DT; t.y += t.vy * DT
}

function teeter(t: TopState, spec: TopSpec, input: TickInput, side: Side, tick: number, out: BattleEvent[]): void {
  const d = Math.sqrt(t.x * t.x + t.y * t.y)
  const nx = d > 1e-6 ? t.x / d : 0, ny = d > 1e-6 ? t.y / d : 1
  t.x = nx * (1 - spec.radius); t.y = ny * (1 - spec.radius)
  if (t.spiritTicks > 0 && t.summonTicks === 0) {
    t.edgeTicks = 0; t.edgeClimb = 0
    t.vx = -nx * T.edgeEscapeV; t.vy = -ny * T.edgeEscapeV
    out.push({ k: 'edgeSave', tick, side })
    return
  }
  t.vx = 0; t.vy = 0
  t.spin -= (TIP[spec.tip].decay * spec.decayMod + T.drag * t.spin) * DT
  const inward = -(input.tiltX * nx + input.tiltY * ny)
  t.edgeClimb += (Math.max(0, t.spin) * T.edgeSpinClimb * TIP[spec.tip].edge + Math.max(0, inward) * T.edgeSteerClimb) * DT
  if (t.edgeClimb >= 1) {
    t.edgeTicks = 0; t.edgeClimb = 0
    t.vx = -nx * T.edgeEscapeV; t.vy = -ny * T.edgeEscapeV
    out.push({ k: 'edgeSave', tick, side })
    return
  }
  if (--t.edgeTicks === 0) { t.edgeClimb = 0; t.out = true; t.vx = nx * T.ringoutV; t.vy = ny * T.ringoutV }
}

const lostBy = (t: TopState): 'shatter' | 'ringout' | 'spin' | null =>
  t.shattered ? 'shatter' : t.out ? 'ringout' : t.stopped ? 'spin' : null

function judge(s: BattleState): RoundOutcome | null {
  const la = lostBy(s.tops[0]), lb = lostBy(s.tops[1])
  if (la && lb && s.tops[0].spin === s.tops[1].spin) return { winner: null, finish: 'draw', points: 0 }
  if (la || lb) {
    const winner: Side = la && lb ? (s.tops[0].spin > s.tops[1].spin ? 0 : 1) : la ? 1 : 0
    const finish = (winner === 0 ? lb : la) as 'shatter' | 'ringout' | 'spin'
    if (finish !== 'spin' && s.tops[winner].spiritTicks > 0) return { winner, finish: 'spirit', points: 3 }
    return { winner, finish, points: finish === 'spin' ? 1 : 2 }
  }
  if (s.tick - s.pausedTicks >= ROUND_TICKS && s.tops[0].spiritTicks === 0 && s.tops[1].spiritTicks === 0) {
    const [a, b] = s.tops
    if (a.spin === b.spin) return { winner: null, finish: 'draw', points: 0 }
    return { winner: a.spin > b.spin ? 0 : 1, finish: 'spin', points: 1 }
  }
  return null
}
