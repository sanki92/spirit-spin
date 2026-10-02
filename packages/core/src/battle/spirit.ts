/** Spirit Call: gauge, hesitation and each type's Spirit Skill activation (spec §5.4, §5.5). */
import type { TopSpec } from '../parts'
import { T } from './tuning'
import type { BattleEvent, Side, TickInput, TopState } from './types'

export function updateSpirit(t: TopState, spec: TopSpec, foe: TopState, input: TickInput, side: Side, tick: number, out: BattleEvent[]): void {
  if (t.spiritTicks > 0) {
    t.spiritTicks--
    if (spec.type === 'stamina') t.spin = Math.min(1.1, t.spin + T.tideRegen / 60)
    if (t.spiritTicks === 0) { t.strikeArmed = false; out.push({ k: 'spiritEnd', tick, side }) }
    return
  }
  t.gauge = Math.min(1, t.gauge + T.gaugePerSec / 60)
  if (!input.spirit || t.gauge < 1) return

  if (t.hesitate) {
    t.hesitate = false
    t.gauge = 0.5
    out.push({ k: 'hesitate', tick, side })
    return
  }
  t.gauge = 0
  t.spiritTicks = T.spiritTicks
  out.push({ k: 'spirit', tick, side })
  if (spec.type === 'attack') {
    t.strikeArmed = true
    const dx = foe.x - t.x, dy = foe.y - t.y, d = Math.sqrt(dx * dx + dy * dy)
    if (d > 0) { t.vx = (dx / d) * T.strikeV; t.vy = (dy / d) * T.strikeV }
  } else if (spec.type === 'balance') {
    t.strikeArmed = true
  }
}
