import type { TopSpec } from '../parts'
import { T } from './tuning'
import type { BattleEvent, BeastMove, Side, TopState } from './types'

const X = T.tech

function emit(out: BattleEvent[], tick: number, side: Side, move: BeastMove, x: number, y: number): void {
  out.push({ k: 'beast', tick, side, move, x, y })
}

function aim(t: TopState, x: number, y: number, v: number): number {
  const dx = x - t.x, dy = y - t.y, d = Math.sqrt(dx * dx + dy * dy)
  if (d > 1e-6) { t.vx = (dx / d) * v; t.vy = (dy / d) * v }
  return d
}

function blend(t: TopState, vx: number, vy: number, k: number): void {
  t.vx += (vx - t.vx) * k
  t.vy += (vy - t.vy) * k
}

function home(t: TopState, foe: TopState, v: number, k: number): void {
  const dx = foe.x - t.x, dy = foe.y - t.y, d = Math.sqrt(dx * dx + dy * dy)
  if (d > 1e-6) blend(t, (dx / d) * v, (dy / d) * v, k)
}

function arm(t: TopState, mul: number, n: number): void {
  t.strikeArmed = true
  t.strikeMul = mul
  t.strikes = n
}

function hold(t: TopState, x: number, y: number): void {
  if (aim(t, x, y, X.anchorV) < 0.05) { t.vx = 0; t.vy = 0 }
}

function push(foe: TopState, fromX: number, fromY: number, k: number, tick: number): void {
  const dx = foe.x - fromX, dy = foe.y - fromY, d = Math.sqrt(dx * dx + dy * dy)
  if (d < 1e-6) return
  foe.vx += (dx / d) * k
  foe.vy += (dy / d) * k
  foe.lastHitTick = tick
}

function behind(t: TopState, foe: TopState, gap: number, v: number): void {
  const sp = Math.sqrt(foe.vx * foe.vx + foe.vy * foe.vy)
  let hx = sp > 1e-3 ? foe.vx / sp : -foe.x, hy = sp > 1e-3 ? foe.vy / sp : -foe.y
  const hl = Math.sqrt(hx * hx + hy * hy)
  if (hl > 1e-6) { hx /= hl; hy /= hl } else { hx = 1; hy = 0 }
  let x = foe.x - hx * gap, y = foe.y - hy * gap
  const d = Math.sqrt(x * x + y * y)
  if (d > 0.82) { x = (x / d) * 0.82; y = (y / d) * 0.82 }
  t.x = x
  t.y = y
  aim(t, foe.x, foe.y, v)
}

function drive(t: TopState, spec: TopSpec, foe: TopState, side: Side, tick: number, out: BattleEvent[]): void {
  const e = T.takeoverTicks - 1 - t.spiritTicks
  const ult = spec.ultimate ? X.ult : 1
  switch (spec.beastId) {
    case 'voltfang': {
      t.actTicks++
      const due = t.act === 0 || t.actTicks >= (t.strikeArmed ? X.fangDashTicks : X.fangGap)
      if (t.act < X.fangDashes && due) {
        aim(t, foe.x, foe.y, X.fangDash)
        arm(t, X.fangMul, 1)
        t.act++
        t.actTicks = 0
        emit(out, tick, side, 'dash', t.x, t.y)
      } else if (t.strikeArmed) home(t, foe, X.fangDash, X.fangHome)
      break
    }
    case 'aegiron':
      if (e === 0) { t.shieldTicks = T.takeoverTicks; emit(out, tick, side, 'anchor', 0, 0) }
      if (e < X.slamAt) hold(t, 0, 0)
      else { t.vx = 0; t.vy = 0 }
      if (e === X.slamAt) {
        const dx = foe.x - t.x, dy = foe.y - t.y, d = Math.sqrt(dx * dx + dy * dy)
        if (d < X.slamRange) push(foe, t.x, t.y, X.slamPush * ult * (1 - d / X.slamRange), tick)
        emit(out, tick, side, 'shockwave', t.x, t.y)
      }
      break
    case 'nagara': {
      if (e === 0) emit(out, tick, side, 'orbit', t.x, t.y)
      const dx = t.x - foe.x, dy = t.y - foe.y, d = Math.sqrt(dx * dx + dy * dy)
      if (d > 1e-6) {
        const rx = dx / d, ry = dy / d, r = X.coilR0 + ((X.coilR1 - X.coilR0) * e) / T.takeoverTicks
        blend(t, foe.vx - ry * X.coilV - rx * (d - r) * X.coilPull, foe.vy + rx * X.coilV - ry * (d - r) * X.coilPull, X.coilGrip)
        if (d < X.coilRange) { const k = (X.coilDrain * ult) / 60; foe.spin -= k; t.spin = Math.min(1.1, t.spin + k * 0.5) }
      }
      if (e === X.coilEnd) { push(foe, t.x, t.y, X.coilPush, tick); emit(out, tick, side, 'fling', foe.x, foe.y) }
      break
    }
    case 'agnyx':
      if (e < X.riseTicks) blend(t, 0, 0, X.riseBrake)
      else if (e === X.riseTicks) {
        aim(t, foe.x, foe.y, X.diveV)
        arm(t, X.diveMul, 1)
        t.stealArmed = true
        emit(out, tick, side, 'dive', t.x, t.y)
      } else if (t.stealArmed) home(t, foe, X.diveV, X.diveHome)
      break
    case 'zephyra':
      if (e < X.vortexAt) hold(t, 0, 0)
      else { t.vx = 0; t.vy = 0 }
      if (e === X.vortexAt) { t.pullTicks = X.pull; emit(out, tick, side, 'vortex', t.x, t.y) }
      break
    case 'umbrax':
      if (e === X.pounceAt) {
        behind(t, foe, X.pounceGap, X.pounceDash)
        arm(t, X.pounceMul, spec.ultimate ? 3 : 2)
        emit(out, tick, side, 'pounce', t.x, t.y)
      } else if (e > X.pounceAt && t.strikeArmed && t.lastHitTick === tick - 1) aim(t, foe.x, foe.y, X.pounceDash)
      break
  }
}

export function tickTechnique(t: TopState, spec: TopSpec, foe: TopState, side: Side, tick: number, out: BattleEvent[]): void {
  if (t.stunTicks > 0) t.stunTicks--
  if (t.shieldTicks > 0) t.shieldTicks--
  if (t.burnTicks > 0) { t.burnTicks--; t.spin -= X.burnDrain / 60 }
  if (t.pullTicks > 0 && --t.pullTicks === 0) {
    push(foe, 0, 0, X.fling * (spec.ultimate ? X.ult : 1), tick)
    emit(out, tick, side, 'fling', foe.x, foe.y)
  }
  if (t.spiritTicks > 0 && t.summonTicks === 0) drive(t, spec, foe, side, tick, out)
}
