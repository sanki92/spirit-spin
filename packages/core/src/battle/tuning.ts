/**
 * Every battle feel number lives here. Change these (and only these) when balancing; `npm run balance` must stay green.
 * Units: stadium radius = 1, time in seconds, spin normalized (1.0 = 15,000 RPM).
 */
import type { TipKind, TopType } from '../parts'

export const TICK_HZ = 60
export const DT = 1 / TICK_HZ
export const ROUND_TICKS = 40 * TICK_HZ

export const T = {
  slope: 2.2146, // bowl pull toward center (a = -slope * pos)
  vmax: 3.2, // stadium radii / s at full drive
  drag: 0.012, // extra spin decay proportional to spin
  stopSpin: 0.02, // at or below this the top falls over
  wobbleSpin: 0.2, // below this the top starts to wobble
  wobbleForce: 0.7043,
  steer: 1.2, // tilt push (raw acceleration)
  steerTurn: 2.9774, // how strongly tilt turns the tip's drive direction
  steerCost: 0.03, // spin per second at full tilt
  wallE: 0.45, // wall restitution
  wallSpinLoss: 0.0186, // spin lost per unit of outward impact speed
  ringoutV: 0.6506, // outward speed needed to leave through a pocket
  clashE: 0.5045, // collision restitution
  recoil: 0.7423, // spin-driven separation impulse
  clashSpinLoss: 0.0198,
  clashFriction: 0.0101, // spin both sides lose to contact friction
  shatterMin: 0.3146, // received impact below this never builds shatter
  shatterGain: 0.4528,
  shatterCap: 0.1853,
  gaugeClash: 0.08,
  gaugePerSec: 0.0925,
  summonTicks: TICK_HZ,
  takeoverTicks: 150,
  strikeMul: 2.8, strikeShatterMul: 1.8,
  bastionMass: 2.2996, bastionTaken: 0.35, bastionReflect: 1.4,
  turnSteal: 0.3097, turnMul: 1,
  attackMomentum: 0.15,
  launchGraceTicks: 60,
  edgeTicks: 36,
  edgeSpinClimb: 3.75,
  edgeSteerClimb: 2.0,
  edgeEscapeV: 0.6,
  knockWindowTicks: 90,
  overspinDrain: 0.1553,
  overspinTicks: 81.297,
  spinBase: 0.4, spinFromRpm: 0.6, overspinBonus: 0.1,
  tech: {
    ult: 1.25,
    stun: 28, stunUlt: 84, stunCruise: 0.656, stunGrip: 2.2,
    fangMul: 1.2, fangDashes: 3, fangDash: 3.042, fangDashTicks: 30, fangGap: 12, fangHome: 0.08,
    reflectUlt: 1.45, anchorV: 2.0, slamAt: 95, slamRange: 0.899, slamPush: 3.2,
    coilR0: 0.45, coilR1: 0.15, coilV: 2.4, coilPull: 6, coilGrip: 0.25, coilRange: 0.5, coilDrain: 0.14, coilEnd: 129, coilPush: 1.609,
    stealUlt: 2, riseTicks: 50, riseBrake: 0.2, diveV: 1.875, diveHome: 0.1, diveMul: 1.519, burnTicks: 120, burnDrain: 0.138,
    vortexAt: 17, pull: 110, pullForce: 3.076, pullClash: 1.5, pullMass: 1.4367, fling: 1.5,
    pounceAt: 10, pounceGap: 0.26, pounceDash: 2.587, pounceMul: 4.0,
    staticCharge: 1.2, bedrock: 1.15, ebb: 0.92, embersAtk: 1.25, embersSpin: 0.3, tailwind: 1.08, ambush: 1.25,
  },
}

/** gain = how hard the tip accelerates toward its cruising speed; brake = sliding friction when knocked faster
 *  than that (low: a knocked top glides; needles slide most, balls dig in).
 *  curve = grip-induced turning rate (rad/s): the top traces loops of radius speed/curve while the bowl pulls it back (flower pattern). */
export interface TipPhysics { drive: number; curve: number; gain: number; brake: number; decay: number; center: number; edge: number }
export const TIP: Record<TipKind, TipPhysics> = {
  flat: { drive: 0.95, curve: 2.5, gain: 3.0, brake: 0.35, decay: 0.05, center: 0.8, edge: 0.5 },
  semi: { drive: 0.6, curve: 2.0, gain: 2.9507, brake: 0.3, decay: 0.0425, center: 1.0, edge: 1.0 },
  ball: { drive: 0.3, curve: 1.0, gain: 1.4975, brake: 0.6933, decay: 0.031, center: 1.2381, edge: 1.1 },
  needle: { drive: 0.12, curve: 0.5, gain: 1.0, brake: 0.2, decay: 0.019, center: 1.9733, edge: 1.1 },
}

export const TYPE_EDGE: Record<TopType, Record<TopType, number>> = {
  attack: { attack: 1, defense: 0.9071, stamina: 1.3859, balance: 1.3 },
  defense: { attack: 1.4454, defense: 1, stamina: 0.999, balance: 1 },
  stamina: { attack: 0.7694, defense: 1.11, stamina: 1, balance: 0.9 },
  balance: { attack: 0.95, defense: 1.1, stamina: 0.85, balance: 1 },
}

// Ring-out pockets at 90°, 210°, 330° (precomputed literals: the sim never calls trig).
export const POCKETS: readonly (readonly [number, number])[] = [
  [0, 1],
  [-0.8660254037844386, -0.5],
  [0.8660254037844386, -0.5],
]
export const POCKET_COS = 0.9702957262759965 // cos(14°): each pocket is 28° wide
