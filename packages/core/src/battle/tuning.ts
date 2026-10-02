/**
 * Every battle feel number lives here. Change these (and only these) when balancing; `npm run balance` must stay green.
 * Units: stadium radius = 1, time in seconds, spin normalized (1.0 = 15,000 RPM).
 */
import type { TipKind } from '../parts'

export const TICK_HZ = 60
export const DT = 1 / TICK_HZ
export const ROUND_TICKS = 40 * TICK_HZ

export const T = {
  slope: 1.6, // bowl pull toward center (a = -slope * pos)
  vmax: 1.7, // stadium radii / s at full drive
  drag: 0.012, // extra spin decay proportional to spin
  stopSpin: 0.02, // at or below this the top falls over
  wobbleSpin: 0.2, // below this the top starts to wobble
  wobbleForce: 0.9,
  steer: 1.1, // tilt acceleration
  steerCost: 0.018, // spin per second at full tilt
  wallE: 0.45, // wall restitution
  wallSpinLoss: 0.035, // spin lost per unit of outward impact speed
  ringoutV: 0.55, // outward speed needed to leave through a pocket
  clashE: 0.55, // collision restitution
  recoil: 0.9, // spin-driven separation impulse
  clashSpinLoss: 0.05,
  shatterMin: 0.55, // clash energy below this never builds shatter
  shatterGain: 0.33,
  gaugeClash: 0.07,
  gaugePerSec: 1 / 28,
  spiritTicks: 4 * TICK_HZ,
  strikeV: 2.2, // attack Surge Strike dash speed
  strikeMul: 2.2, strikeShatterMul: 1.5,
  bastionMass: 4, bastionTaken: 0.35, bastionReflect: 1.4,
  tideRegen: 0.07, tideCenter: 1.5,
  turnSteal: 0.15, turnMul: 1.6,
  overspinTicks: 3 * TICK_HZ,
  spinBase: 0.4, spinFromRpm: 0.6, overspinBonus: 0.1,
} as const

export interface TipPhysics { drive: number; orbit: number; gain: number; decay: number; center: number }
export const TIP: Record<TipKind, TipPhysics> = {
  flat: { drive: 0.95, orbit: 0.02, gain: 0.6, decay: 0.048, center: 0.8 },
  semi: { drive: 0.6, orbit: 0.012, gain: 0.9, decay: 0.034, center: 1.0 },
  ball: { drive: 0.3, orbit: 0.006, gain: 1.4, decay: 0.03, center: 1.4 },
  needle: { drive: 0.12, orbit: 0.003, gain: 2.0, decay: 0.022, center: 1.2 },
}

// Ring-out pockets at 90°, 210°, 330° (precomputed literals: the sim never calls trig).
export const POCKETS: readonly (readonly [number, number])[] = [
  [0, 1],
  [-0.8660254037844386, -0.5],
  [0.8660254037844386, -0.5],
]
export const POCKET_COS = 0.9702957262759965 // cos(14°): each pocket is 28° wide
