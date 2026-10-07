/** Spirit Call: gauge, hesitation and each type's Spirit Skill activation (spec §5.4, §5.5). */
import type { TopSpec } from '../parts'
import { T } from './tuning'
import type { BattleEvent, Side, TickInput, TopState } from './types'

export function updateSpirit(t: TopState, spec: TopSpec, foe: TopState, input: TickInput, side: Side, tick: number, out: BattleEvent[]): void {
  if (t.spiritTicks > 0) {
    t.spiritTicks--
    if (t.spiritTicks === 0) { t.strikeArmed = false; t.strikes = 0; t.stealArmed = false; t.shieldTicks = 0; out.push({ k: 'spiritEnd', tick, side }) }
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
  t.summonTicks = T.summonTicks
  t.spiritTicks = T.takeoverTicks
  t.act = 0
  t.actTicks = 0
  out.push({ k: 'spirit', tick, side })
}
