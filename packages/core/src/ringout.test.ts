import { describe, expect, it } from 'vitest'
import { createBattle, stepBattle, type BattleEvent, type TickInput } from './battle'
import { botInput, botRip, BOT_LEVELS, type BotBrain } from './bot'
import { assembleTop, BEAST_IDS, STARTER_BUILDS } from './parts'
import type { RipResult } from './rip'
import { createRng, rngNext } from './rng'

const specs = BEAST_IDS.map(b => assembleTop(STARTER_BUILDS[b]))
const rip = (overspin = false): RipResult => ({ ok: true, rpm: overspin ? 13000 : 11500, quality: 'GREAT', overspin, style: 'flat', bankDir: 0, timing: 1, straightness: 1, pullRatio: overspin ? 1.3 : 0.9, startT: 0 })
const IDLE: TickInput = { tiltX: 0, tiltY: 0, spirit: false }
const N = 288

function measure(brain: BotBrain | null, overspin: boolean) {
  const rng = createRng(11)
  let ringouts = 0, early = 0, edges = 0, saves = 0
  const ev: BattleEvent[] = []
  for (let i = 0; i < N; i++) {
    const a = specs[i % 6]!, b = specs[Math.floor(i / 6) % 6]!
    const r0 = overspin ? rip(true) : brain ? botRip(rng, brain, a) : rip(), r1 = brain ? botRip(rng, brain, b) : rip()
    const s = createBattle([a, b], [{ rip: r0, hesitate: false }, { rip: r1, hesitate: false }], Math.floor(rngNext(rng) * 2 ** 31))
    while (!s.outcome) {
      stepBattle(s, [brain ? botInput(s, 0, brain, rng) : IDLE, brain ? botInput(s, 1, brain, rng) : IDLE], ev)
      for (const e of ev) { if (e.k === 'edge') edges++; else if (e.k === 'edgeSave') saves++ }
      ev.length = 0
    }
    if (s.outcome.finish === 'ringout') { ringouts++; if (s.tick - s.pausedTicks < 120) early++ }
  }
  return { ringout: ringouts / N, early: early / N, save: edges ? saves / edges : 0 }
}

describe('ring-outs are earned, not cheap', () => {
  const idle = measure(null, false)
  const idleOver = measure(null, true)
  const normal = measure(BOT_LEVELS.normal, false)
  const normalOver = measure(BOT_LEVELS.normal, true)

  it('tops nobody steers ring out far less than the old 28%', () => {
    expect(idle.ringout).toBeLessThanOrEqual(0.2)
  })

  it('almost nothing rings out in the first two seconds', () => {
    for (const m of [idle, normal]) expect(m.early).toBeLessThanOrEqual(0.02)
  })

  it('an overspin launch rarely ends in a ring-out inside two seconds (was 23%)', () => {
    for (const m of [idleOver, normalOver]) expect(m.early).toBeLessThanOrEqual(0.03)
  })

  it('ring-outs still happen between steering players', () => {
    expect(normal.ringout).toBeGreaterThan(0)
  })

  it('a good share of teeters end in a save without steering', () => {
    expect(idle.save).toBeGreaterThanOrEqual(0.3)
    expect(idle.save).toBeLessThanOrEqual(0.7)
  })
})
