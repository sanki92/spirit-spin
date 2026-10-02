import { describe, expect, it } from 'vitest'
import { runBalance } from './balance'
import { BOT_LEVELS } from './bot'

describe('balance guard (regression bounds; strict targets live in scripts/balance.ts)', () => {
  const r = runBalance(40, BOT_LEVELS.hard, 7)
  it('no matchup is a blowout', () => {
    for (const [k, v] of Object.entries(r.matchups)) {
      expect(v, k).toBeGreaterThanOrEqual(0.22)
      expect(v, k).toBeLessThanOrEqual(0.78)
    }
  })
  it('every finish type happens and draws are rare', () => {
    expect(r.finishMix.spin).toBeGreaterThan(0.2)
    expect(r.finishMix.ringout).toBeGreaterThan(0.05)
    expect(r.finishMix.shatter).toBeGreaterThan(0.03)
    expect(r.finishMix.spirit).toBeGreaterThan(0.05)
    expect(r.finishMix.draw).toBeLessThan(0.05)
  })
  it('rounds are snappy but not instant', () => {
    expect(r.meanRoundSeconds).toBeGreaterThan(5)
    expect(r.meanRoundSeconds).toBeLessThan(25)
    expect(r.timeoutRate).toBeLessThan(0.1)
  })
  it('skill beats strength: a great rip beats a weak one, overspin is not worth it', () => {
    expect(r.greatVsWeak).toBeGreaterThanOrEqual(0.65)
    expect(r.overspinVsGreat).toBeLessThanOrEqual(0.5)
  })
})
