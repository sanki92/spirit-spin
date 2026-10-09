import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { RipResult } from '@spirit/core'
import { goodLaunch, hintsLive, steerHintDue } from './hints'

describe('early-battle reminders', () => {
  it('stay on for the first three battles unless the player already has it down', () => {
    expect(hintsLive(undefined)).toBe(true)
    expect(hintsLive({ battles: 2, launches: 0, steers: 0 })).toBe(true)
    expect(hintsLive({ battles: 3, launches: 0, steers: 0 })).toBe(false)
    expect(hintsLive({ battles: 1, launches: 3, steers: 2 })).toBe(true)
    expect(hintsLive({ battles: 1, launches: 3, steers: 3 })).toBe(false)
  })

  it('a good launch is a timed GOOD or better without overspin', () => {
    expect(goodLaunch({ ok: true, quality: 'GOOD', overspin: false } as RipResult)).toBe(true)
    expect(goodLaunch({ ok: true, quality: 'WEAK', overspin: false } as RipResult)).toBe(false)
    expect(goodLaunch({ ok: true, quality: 'PERFECT', overspin: true } as RipResult)).toBe(false)
    expect(goodLaunch({ ok: false, reason: 'too-early' })).toBe(false)
  })

  it('the steer hint shows after 2 s without a stick touch and hides on touch or after 4 s', () => {
    expect(steerHintDue(1900, false)).toBe(false)
    expect(steerHintDue(2000, false)).toBe(true)
    expect(steerHintDue(3000, true)).toBe(false)
    expect(steerHintDue(6100, false)).toBe(false)
  })

  it('guide overlays never take touches, even against the HUD child rule', () => {
    const css = readFileSync(new URL('../ui/hud/launch.css', import.meta.url), 'utf8')
    const hud = readFileSync(new URL('../styles.css', import.meta.url), 'utf8') + readFileSync(new URL('../v2.css', import.meta.url), 'utf8')
    expect(hud).toMatch(/\.hud > \*\s*\{[^}]*pointer-events:\s*auto/)
    expect(css).toMatch(/\.hud > \.guide-thumb[^{]*\{[^}]*pointer-events:\s*none\s*!important/)
    expect(css).toMatch(/\.guide-thumb \*[^{]*\{[^}]*pointer-events:\s*none\s*!important/)
  })
})
