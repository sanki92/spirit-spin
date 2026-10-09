import { describe, expect, it } from 'vitest'
import { armMotion, motionOn } from './motionSetting'

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
