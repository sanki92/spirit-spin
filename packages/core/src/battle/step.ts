/** One fixed 60 Hz tick. Mutates state in place (zero allocation besides pushed events). */
import type { TopSpec } from '../parts'
import { rngNext } from '../rng'
import { resolveClash, resolveWall } from './collide'
import { updateSpirit } from './spirit'
import { DT, ROUND_TICKS, T, TIP } from './tuning'
import type { BattleEvent, BattleState, RoundOutcome, Side, TickInput, TopState } from './types'

const clampTilt = (v: number) => (Number.isFinite(v) ? (v > 1 ? 1 : v < -1 ? -1 : v) : 0)

export function stepBattle(s: BattleState, inputs: readonly [TickInput, TickInput], out: BattleEvent[]): void {
  if (s.outcome) return
  s.tick++
  for (let i = 0; i < 2; i++) {
    const side = i as Side
    const t = s.tops[side], spec = s.specs[side], foe = s.tops[(1 - side) as Side]
    const raw = inputs[side]
    const input: TickInput = { tiltX: clampTilt(raw.tiltX), tiltY: clampTilt(raw.tiltY), spirit: raw.spirit === true }
    updateSpirit(t, spec, foe, input, side, s.tick, out)
    moveTop(s, t, spec, input)
  }
  resolveClash(s, out)
  for (let i = 0; i < 2; i++) resolveWall(s.tops[i as Side], s.specs[i as Side], i as Side, s.tick, out)
  for (const t of s.tops) if (t.spin <= T.stopSpin) { t.spin = Math.max(t.spin, 0); t.stopped = true }

  const o = judge(s)
  if (o) { s.outcome = o; out.push({ k: 'finish', tick: s.tick, outcome: o }) }
}

function moveTop(s: BattleState, t: TopState, spec: TopSpec, input: TickInput): void {
  const tip = TIP[spec.tip]
  const centerMul = tip.center * (t.spiritTicks > 0 && spec.type === 'stamina' ? T.tideCenter : 1)
  let ax = -T.slope * centerMul * t.x, ay = -T.slope * centerMul * t.y

  // Velocity controller. Desired velocity = cruise speed along (heading curved by grip + player tilt);
  // actual velocity relaxes toward it with the tip's grip, or only its sliding friction when knocked faster than cruise.
  const speed = Math.sqrt(t.vx * t.vx + t.vy * t.vy)
  let hx = speed > 1e-3 ? t.vx / speed : -t.y, hy = speed > 1e-3 ? t.vy / speed : t.x
  const hl = Math.sqrt(hx * hx + hy * hy); if (hl > 1e-6) { hx /= hl; hy /= hl } else { hx = 1; hy = 0 }
  const turn = tip.curve * DT // right spin curves clockwise
  let dx = hx + hy * turn + input.tiltX * T.steerTurn, dy = hy - hx * turn + input.tiltY * T.steerTurn
  const dl = Math.sqrt(dx * dx + dy * dy); if (dl > 1e-6) { dx /= dl; dy /= dl } else { dx = hx; dy = hy }
  const cruise = tip.drive * spec.driveMod * Math.max(t.spin, 0) * T.vmax * (0.5 + 0.05 * spec.stats.speed)
  const grip = speed > cruise * 1.05 ? tip.brake : tip.gain
  ax += (dx * cruise - t.vx) * grip
  ay += (dy * cruise - t.vy) * grip

  if (t.overspinTicks > 0) { t.overspinTicks--; t.wobble = t.overspinTicks / T.overspinTicks; t.spin -= T.overspinDrain * DT }
  else if (t.spin < T.wobbleSpin) t.wobble = Math.max(t.wobble, (T.wobbleSpin - t.spin) / T.wobbleSpin)
  if (t.wobble > 0) {
    ax += (rngNext(s.rng) - 0.5) * 2 * T.wobbleForce * t.wobble
    ay += (rngNext(s.rng) - 0.5) * 2 * T.wobbleForce * t.wobble
  }

  ax += T.steer * input.tiltX; ay += T.steer * input.tiltY
  const tilt = Math.sqrt(input.tiltX * input.tiltX + input.tiltY * input.tiltY)
  const staminaFactor = 1.3 - 0.06 * spec.stats.stamina
  t.spin -= ((tip.decay * spec.decayMod + T.drag * t.spin) * staminaFactor + T.steerCost * Math.min(tilt, 1)) * DT

  t.vx += ax * DT; t.vy += ay * DT
  t.x += t.vx * DT; t.y += t.vy * DT
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
  if (s.tick >= ROUND_TICKS) {
    const [a, b] = s.tops
    if (a.spin === b.spin) return { winner: null, finish: 'draw', points: 0 }
    return { winner: a.spin > b.spin ? 0 : 1, finish: 'spin', points: 1 }
  }
  return null
}
