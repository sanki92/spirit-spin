import type { TopSpec } from '../parts'
import { T } from './tuning'
import type { TopState } from './types'

const X = T.tech

function behind(t: TopState, foe: TopState, gap: number): void {
  const sp = Math.sqrt(foe.vx * foe.vx + foe.vy * foe.vy)
  let hx = sp > 1e-3 ? foe.vx / sp : -foe.x, hy = sp > 1e-3 ? foe.vy / sp : -foe.y
  const hl = Math.sqrt(hx * hx + hy * hy)
  if (hl > 1e-6) { hx /= hl; hy /= hl } else { hx = 1; hy = 0 }
  let x = foe.x - hx * gap, y = foe.y - hy * gap
  const d = Math.sqrt(x * x + y * y)
  if (d > 0.82) { x = (x / d) * 0.82; y = (y / d) * 0.82 }
  t.x = x
  t.y = y
  const dx = foe.x - t.x, dy = foe.y - t.y, dl = Math.sqrt(dx * dx + dy * dy)
  if (dl > 1e-6) { t.vx = (dx / dl) * X.stepDash; t.vy = (dy / dl) * X.stepDash }
}

function lunge(t: TopState, foe: TopState, mul = 1): void {
  const dx = foe.x - t.x, dy = foe.y - t.y, d = Math.sqrt(dx * dx + dy * dy)
  if (d > 0) { t.vx = (dx / d) * T.strikeV * mul; t.vy = (dy / d) * T.strikeV * mul }
}

export function activateTechnique(t: TopState, spec: TopSpec, foe: TopState): void {
  const ult = spec.ultimate
  switch (spec.beastId) {
    case 'voltfang':
      foe.stunTicks = ult ? X.stunUlt : X.stun
      t.strikeArmed = true
      lunge(t, foe)
      t.strikeMul = X.fangMul
      t.strikes = ult ? 2 : 1
      break
    case 'aegiron':
      t.shieldTicks = X.shield
      break
    case 'nagara':
      break
    case 'agnyx':
      t.stealArmed = true
      lunge(t, foe, X.phoenixDash)
      break
    case 'zephyra':
      t.pullTicks = ult ? X.pullUlt : X.pull
      break
    case 'umbrax':
      t.phaseTicks = X.phase
      t.steps = ult ? 2 : 1
      break
  }
}

export function tickTechnique(t: TopState, spec: TopSpec, foe: TopState): void {
  if (t.stunTicks > 0) t.stunTicks--
  if (t.shieldTicks > 0) t.shieldTicks--
  if (t.burnTicks > 0) { t.burnTicks--; t.spin -= X.burnDrain / 60 }
  if (t.pullTicks > 0) {
    t.pullTicks--
    if (t.pullTicks <= 0 && spec.ultimate) {
      const d = Math.sqrt(foe.x * foe.x + foe.y * foe.y)
      if (d > 1e-3) { foe.vx += (foe.x / d) * X.fling; foe.vy += (foe.y / d) * X.fling }
    }
  }
  if (t.phaseTicks > 0) {
    t.phaseTicks--
    if (t.phaseTicks <= 0) {
      behind(t, foe, 0.26)
      t.strikeArmed = true
      t.strikeMul = X.stepMul
      t.strikes = 1
      t.steps--
      if (t.steps > 0) t.phaseTicks = X.phase
    }
  }
  if (spec.beastId === 'nagara' && t.spiritTicks > 0 && foe.pullTicks <= 0) {
    t.spin = Math.min(1.1, t.spin + T.tideRegen / 60)
    foe.spin -= X.tideDrain / 60
  }
}

export const isTideOn = (t: TopState, spec: TopSpec) => spec.beastId === 'nagara' && t.spiritTicks > 0
