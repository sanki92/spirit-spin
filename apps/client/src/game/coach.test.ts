import { composeRip } from '@spirit/core'
import { describe, expect, it } from 'vitest'
import { coachTip } from './coach'
import { flightProgress, KICK_MS, launchDuration, LAUNCH_PLAN, planFor, tierOf } from './launchPlan'

describe('coachTip', () => {
  it('names the weakest part of the rip', () => {
    expect(coachTip({ ok: false, reason: 'no-pull' }, false).title).toBe('Too soft')
    expect(coachTip(composeRip(1, 0.3, 1, 0, 0), false).title).toMatch(/straight/)
    expect(coachTip(composeRip(1, 1, 0.45, 0, 0), false).title).toMatch(/faster/)
    expect(coachTip(composeRip(1, 1, 2, 0, 0), false).title).toBe('Overspin!')
    expect(coachTip(composeRip(1, 1, 1, 0, 0), false).title).toBe('Perfect form!')
  })

  it('uses swipe wording without motion', () => {
    expect(coachTip(composeRip(1, 0.3, 1, 0, 0), true).text).toMatch(/swipe/)
  })
})

describe('launch plan', () => {
  it('maps rip results to tiers', () => {
    expect(tierOf({ ok: false })).toBe('FAIL')
    expect(tierOf({ ok: true, quality: 'GREAT', overspin: true })).toBe('OVERSPIN')
    expect(tierOf({ ok: true, quality: 'PERFECT', overspin: false })).toBe('PERFECT')
    expect(tierOf({ ok: true, quality: 'WEAK', overspin: false })).toBe('WEAK')
  })

  it('lands every tier inside the launch window', () => {
    const plans = Object.values(LAUNCH_PLAN)
    const dur = launchDuration(plans)
    for (const p of plans) {
      expect(flightProgress(p, 0)).toBe(0)
      expect(flightProgress(p, KICK_MS + p.flight)).toBe(1)
      expect(KICK_MS + p.flight).toBeLessThan(dur)
    }
  })

  it('reduced motion shortens the flight and drops shake', () => {
    const p = planFor('PERFECT', true)
    expect(p.flight).toBeLessThanOrEqual(380)
    expect(p.shake).toBe(0)
  })
})
