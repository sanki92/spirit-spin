import type { TopSpec } from '../parts'
import { hashNumbers } from '../hash'
import { createRng } from '../rng'
import { T, TIP } from './tuning'
import type { BattleState, LaunchParams, Side, TopState } from './types'

/** Launch both tops from opposite sides. Flat launches drift to center; bank launches sweep along the wall. */
export function createBattle(specs: [TopSpec, TopSpec], launches: [LaunchParams, LaunchParams], seed: number): BattleState {
  return {
    tick: 0,
    rng: createRng(seed),
    specs,
    tops: [launchTop(specs[0], launches[0], 0), launchTop(specs[1], launches[1], 1)],
    outcome: null,
  }
}

function launchTop(spec: TopSpec, l: LaunchParams, side: Side): TopState {
  const sign = side === 0 ? -1 : 1 // side 0 enters from the left, side 1 from the right
  const power = Number.isFinite(l.rip.rpm) ? Math.max(0, Math.min(1, l.rip.rpm / 15000)) : 0
  const bank = l.rip.style === 'bank'
  const spin = T.spinBase + T.spinFromRpm * power + (l.rip.overspin ? T.overspinBonus : 0)
  const r = bank ? 0.6 : 0.3
  const speed = bank ? 0.6 * T.vmax * TIP[spec.tip].drive * (0.6 + 0.4 * power) : 0.1
  // Bank: tangential velocity (direction picked by bank roll); flat: drift toward center.
  const dir = l.rip.bankDir === -1 ? -1 : 1
  return {
    x: sign * r, y: 0,
    vx: bank ? 0 : -sign * speed,
    vy: bank ? dir * sign * speed : 0,
    spin,
    wobble: l.rip.overspin ? 1 : 0,
    shatter: 0, gauge: 0, spiritTicks: 0, spirits: 0, strikeArmed: false,
    hesitate: l.hesitate,
    overspinTicks: l.rip.overspin ? Math.round(T.overspinTicks) : 0,
    lastHitTick: -1000,
    stunTicks: 0, shieldTicks: 0, pullTicks: 0, phaseTicks: 0, burnTicks: 0, steps: 0, strikes: 0, strikeMul: 1, stealArmed: false, ambushUsed: false,
    out: false, stopped: false, shattered: false,
  }
}

export function battleHash(s: BattleState): string {
  const n: number[] = [s.tick, s.rng.s]
  for (const t of s.tops) {
    n.push(t.x, t.y, t.vx, t.vy, t.spin, t.wobble, t.shatter, t.gauge, t.spiritTicks, t.spirits, t.overspinTicks,
      t.lastHitTick, +t.strikeArmed, +t.hesitate, +t.out, +t.stopped, +t.shattered,
      t.stunTicks, t.shieldTicks, t.pullTicks, t.phaseTicks, t.burnTicks, t.steps, t.strikes, t.strikeMul, +t.stealArmed, +t.ambushUsed)
  }
  return hashNumbers(n)
}
