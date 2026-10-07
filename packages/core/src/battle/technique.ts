import type { TopSpec } from '../parts'
import { T } from './tuning'
import type { BattleEvent, Side, TopState } from './types'

const X = T.tech

export function tickTechnique(t: TopState, spec: TopSpec, foe: TopState, side: Side, tick: number, out: BattleEvent[]): void {
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
}
