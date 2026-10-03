import { describe, expect, it } from 'vitest'
import { applyBattle, applyReply, awakenedForm, awakeningReady, hesitates, newBeast, type BattleSummary } from './spirit'

const sum = (o: Partial<BattleSummary> = {}): BattleSummary => ({
  won: true, comeback: false, finishes: ['spin'], perfectRips: 0, overspins: 0, spiritCalls: 0, aggression: 0.5, boss: null, opponent: 'Rookie', ...o,
})

describe('spirit rules', () => {
  it('a starter beast trusts you enough to answer; a new beast hesitates', () => {
    expect(hesitates(newBeast('voltfang', true))).toBe(false)
    expect(hesitates(newBeast('nagara', false))).toBe(true)
  })
  it('battles together build trust and explain every change', () => {
    const b = newBeast('nagara', false)
    const r = applyBattle(b, sum(), '2026-10-03')
    expect(r.beast.trust).toBeGreaterThan(b.trust)
    expect(r.changes.length).toBeGreaterThan(0)
    for (const c of r.changes) expect(c.reason.length).toBeGreaterThan(3)
  })
  it('a comeback win raises respect and courage and is remembered', () => {
    const r = applyBattle(newBeast('voltfang', true), sum({ comeback: true }), '2026-10-03')
    expect(r.beast.counters.comebacks).toBe(1)
    expect(r.beast.memories.some(m => m.importance >= 4)).toBe(true)
  })
  it('winning rounds in different ways builds curiosity without any AI', () => {
    const b = newBeast('zephyra', true)
    expect(applyBattle(b, sum({ finishes: ['ringout', 'spirit'] }), '2026-10-03').beast.curiosity).toBe(b.curiosity + 1)
    expect(applyBattle(b, sum({ finishes: ['spin', 'spin'] }), '2026-10-03').beast.curiosity).toBe(b.curiosity)
  })
  it('never drops trust for losing or absence', () => {
    const b = newBeast('aegiron', true)
    expect(applyBattle(b, sum({ won: false }), '2026-10-03').beast.trust).toBeGreaterThanOrEqual(b.trust)
  })
  it('clamps each trait to +-3 per day no matter how much you play', () => {
    let b = newBeast('agnyx', true)
    const start = b.courage
    for (let i = 0; i < 20; i++) b = applyBattle(b, sum({ aggression: 0.9, comeback: true }), '2026-10-03').beast
    expect(b.courage - start).toBeLessThanOrEqual(3)
    const next = applyBattle(b, sum({ aggression: 0.9 }), '2026-10-04').beast
    expect(next.courage).toBeGreaterThan(b.courage)
  })
  it('replies shape temperament and bond', () => {
    const b = newBeast('nagara', true)
    expect(applyReply(b, 'comfort', '2026-10-03').beast.trust).toBeGreaterThan(b.trust)
    expect(applyReply(b, 'fireup', '2026-10-03').beast.courage).toBeGreaterThan(b.courage)
  })
  it('awakening needs bond, battles and a story moment; form follows temperament', () => {
    let b = newBeast('voltfang', true)
    expect(awakeningReady(b)).toBe(false)
    b = { ...b, trust: 70, respect: 70, battles: 20 }
    expect(awakeningReady(b)).toBe(false)
    b = { ...b, counters: { ...b.counters, comebacks: 1 } }
    expect(awakeningReady(b)).toBe(true)
    expect(awakenedForm({ ...b, courage: 5, calm: 0 })).toBe('storm')
    expect(awakenedForm({ ...b, courage: 0, calm: 5 })).toBe('phantom')
    expect(awakeningReady({ ...b, awakened: 'storm' })).toBe(false)
  })
})
