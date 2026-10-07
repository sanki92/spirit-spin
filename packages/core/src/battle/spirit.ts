/** Spirit Call: gauge, hesitation and each type's Spirit Skill activation (spec §5.4, §5.5). */
import type { TopSpec } from '../parts'
import { activateTechnique } from './technique'
import { T } from './tuning'
import type { BattleEvent, Side, TickInput, TopState } from './types'

export function updateSpirit(t: TopState, spec: TopSpec, foe: TopState, input: TickInput, side: Side, tick: number, out: BattleEvent[]): void {
  if (t.spiritTicks > 0) {
    t.spiritTicks--
    if (t.spiritTicks === 0) { t.strikeArmed = false; t.strikes = 0; t.stealArmed = false; out.push({ k: 'spiritEnd', tick, side }) }
    return
  }
  if (t.spirits >= T.spiritsPerRound) return
  t.gauge = Math.min(1, t.gauge + T.gaugePerSec / 60)
  if (!input.spirit || t.gauge < 1) return

  if (t.hesitate) {
    t.hesitate = false
    t.gauge = 0.5
    out.push({ k: 'hesitate', tick, side })
    return
  }
  t.gauge = 0
  t.spirits++
  t.spiritTicks = T.spiritTicks
  out.push({ k: 'spirit', tick, side })
  activateTechnique(t, spec, foe)
}
