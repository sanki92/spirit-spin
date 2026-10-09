import { describe, expect, it } from 'vitest'
import { armMotion, flipMotion, MOTION_BLOCKED, motionOn } from './motionSetting'

function io(granted: boolean, event: boolean) {
  const log: string[] = []
  return { log, io: { request: async () => granted, feed: () => ({ start: () => log.push('start'), stop: () => log.push('stop') }), wait: async () => event } }
}

describe('motion controls are opt-in', () => {
  it('reads as off unless explicitly turned on', () => {
    expect(motionOn(undefined)).toBe(false)
    expect(motionOn({})).toBe(false)
    expect(motionOn({ inputMode: 'auto' } as never)).toBe(false)
    expect(motionOn({ motion: false })).toBe(false)
    expect(motionOn({ motion: true })).toBe(true)
  })

  it('arming fails and leaves no feed running when permission is denied', async () => {
    const t = io(false, true)
    expect(await armMotion(t.io)).toBe(false)
    expect(t.log).toEqual([])
  })

  it('arming fails and stops the feed when no motion event arrives', async () => {
    const t = io(true, false)
    expect(await armMotion(t.io)).toBe(false)
    expect(t.log).toEqual(['start', 'stop'])
  })

  it('arming succeeds when an event arrives', async () => {
    const t = io(true, true)
    expect(await armMotion(t.io)).toBe(true)
    expect(t.log).toEqual(['start'])
  })
})

describe('motion switch', () => {
  const rt = (ok: boolean) => { const calls: string[] = []; return { calls, enableMotion: async () => { calls.push('on'); return ok }, disableMotion: () => { calls.push('off') } } }

  it('turning on saves only after the phone allows motion', async () => {
    const r = rt(true), saved: boolean[] = []
    expect(await flipMotion(true, r, p => saved.push(p.motion))).toBeNull()
    expect(saved).toEqual([true])
  })

  it('a blocked phone keeps motion off and explains how to allow it', async () => {
    const r = rt(false), saved: boolean[] = []
    expect(await flipMotion(true, r, p => saved.push(p.motion))).toBe(MOTION_BLOCKED)
    expect(saved).toEqual([false])
  })

  it('turning off stops sensors and saves off', async () => {
    const r = rt(true), saved: boolean[] = []
    expect(await flipMotion(false, r, p => saved.push(p.motion))).toBeNull()
    expect(r.calls).toEqual(['off'])
    expect(saved).toEqual([false])
  })
})

import { canRecalibrate } from './motionSetting'

describe('review fixes: recalibrate only with live motion', () => {
  it('hides recalibration unless motion is on and sensors are live', () => {
    expect(canRecalibrate({ motion: false }, true)).toBe(false)
    expect(canRecalibrate({ motion: true }, false)).toBe(false)
    expect(canRecalibrate({ motion: true }, true)).toBe(true)
  })
})
