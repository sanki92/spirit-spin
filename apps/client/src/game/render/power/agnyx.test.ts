import { TUNING } from '@spirit/core'
import { describe, expect, it } from 'vitest'
import type { Mesh } from 'three'
import { AgnyxPower } from './agnyx'
import { blankTextures, drive, finite, idle, lit, top } from './testkit'

const R = TUNING.tech.riseTicks

describe('Agnyx Phoenix Dive', () => {
  it('a flame column wraps the top while it rises and clears after the dive', () => {
    const p = new AgnyxPower(blankTextures(), 40), me = top(0, 0), foe = top(0.4, 0)
    p.begin(me, foe)
    drive(p, me, foe, 0, R - 5)
    expect((p.group.children[0] as Mesh).visible).toBe(true)
    drive(p, me, foe, R - 4, R + 30, { [R]: ['dive', 0, 0] })
    expect((p.group.children[0] as Mesh).visible).toBe(false)
    expect((p.group.children[2] as Mesh).visible).toBe(true)
    expect(finite(p.group)).toBe(true)
  })
  it('the landing leaves a ring of fire that fades', () => {
    const p = new AgnyxPower(blankTextures(), 40), me = top(0, 0), foe = top(0.4, 0)
    p.begin(me, foe)
    drive(p, me, foe, 0, R + 10, { [R]: ['dive', 0, 0], [R + 10]: ['strike', 0.3, 0] })
    const ring = p.group.children[3] as Mesh
    expect(ring.visible).toBe(true)
    expect(ring.position.x).toBeCloseTo(0.3)
    p.end(); idle(p, me, foe, 2)
    expect(lit(p.group)).toBe(0)
  })
  it('disposes without throwing, even after reset', () => {
    const p = new AgnyxPower(blankTextures(), 40), me = top(0, 0), foe = top(0.4, 0)
    p.begin(me, foe); drive(p, me, foe, 0, 5)
    p.reset()
    expect(() => p.dispose()).not.toThrow()
  })
})
