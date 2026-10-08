import { describe, expect, it, vi } from 'vitest'

describe('reducedMotion', () => {
  it('creates the media query list once and reads it on every call', async () => {
    const mq = { matches: false }
    const spy = vi.fn(() => mq)
    vi.stubGlobal('matchMedia', spy)
    vi.stubGlobal('document', { documentElement: { classList: { contains: () => false } } })
    vi.resetModules()
    const { reducedMotion } = await import('./transitions')
    for (let i = 0; i < 50; i++) reducedMotion()
    expect(spy.mock.calls.length).toBeLessThanOrEqual(1)
    expect(reducedMotion()).toBe(false)
    mq.matches = true
    expect(reducedMotion()).toBe(true)
    vi.unstubAllGlobals()
  })
})
