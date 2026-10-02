import { createBattle, stepBattle, type BattleEvent } from '../src/battle'
import { assembleTop, STARTER_BUILDS } from '../src/parts'
import { composeRip } from '../src/rip'
const fail = composeRip(0.15, 0.3, 0.45, 0, 0)
const s = createBattle([assembleTop(STARTER_BUILDS.voltfang), assembleTop(STARTER_BUILDS.nagara)], [{ rip: fail, hesitate: false }, { rip: fail, hesitate: false }], 1234)
const ev: BattleEvent[] = []
const idle = { tiltX: 0, tiltY: 0, spirit: false }
while (!s.outcome && s.tick < 600) {
  stepBattle(s, [idle, idle], ev)
  for (const e of ev) if (e.k !== 'wall') console.log(s.tick, JSON.stringify(e))
  ev.length = 0
  if (s.tick % 10 === 0) console.log(s.tick, s.tops.map(t => `x${t.x.toFixed(2)} y${t.y.toFixed(2)} v${Math.hypot(t.vx, t.vy).toFixed(2)} spin${t.spin.toFixed(2)} wob${t.wobble.toFixed(2)} hit${t.lastHitTick}`).join(' | '))
}
console.log('outcome', s.tick, JSON.stringify(s.outcome))
