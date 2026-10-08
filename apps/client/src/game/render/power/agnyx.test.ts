import { TUNING } from '@spirit/core'
import { describe, expect, it, vi } from 'vitest'
import type { Mesh } from 'three'
import { AgnyxPower } from './agnyx'
import { blankTextures, drive, finite, idle, lit, top } from './testkit'

const R = TUNING.tech.riseTicks
const mid = (m: Mesh, i: number) => {
  const a = m.geometry.attributes.position!.array as Float32Array
  return [(a[i * 6]! + a[i * 6 + 3]!) / 2, (a[i * 6 + 1]! + a[i * 6 + 4]!) / 2, (a[i * 6 + 2]! + a[i * 6 + 5]!) / 2]
}

describe('Agnyx Phoenix Dive', () => {
  it('a fire tornado spirals up around the top while it rises and clears after the dive', () => {
    const p = new AgnyxPower(blankTextures(), 40), me = top(0, 0), foe = top(0.4, 0)
    p.begin(me, foe)
    drive(p, me, foe, 0, R - 5)
    for (const k of [0, 1]) {
      const rb = p.group.children[k] as Mesh
      expect(rb.visible).toBe(true)
      const n = rb.geometry.attributes.position!.count / 2
      expect(mid(rb, n - 1)[1]!).toBeGreaterThan(mid(rb, 0)[1]! + 0.1)
      for (let i = 0; i < n; i++) {
        const [x, , z] = mid(rb, i)
        expect(Math.hypot(x!, z!)).toBeLessThan(0.2)
      }
    }
    drive(p, me, foe, R - 4, R + 30, { [R]: ['dive', 0, 0] })
    expect((p.group.children[0] as Mesh).visible).toBe(false)
    expect((p.group.children[1] as Mesh).visible).toBe(false)
    expect((p.group.children[3] as Mesh).visible).toBe(true)
    expect(finite(p.group)).toBe(true)
  })
  it('hides the tornado within half a second of the dive cue', () => {
    const p = new AgnyxPower(blankTextures(), 40), me = top(0, 0), foe = top(0.4, 0)
    p.begin(me, foe)
    drive(p, me, foe, 0, R + 30, { [R]: ['dive', 0, 0] })
    expect((p.group.children[0] as Mesh).visible).toBe(false)
  })
  it('the landing leaves a ring of fire that grows and fades', () => {
    const p = new AgnyxPower(blankTextures(), 40), me = top(0, 0), foe = top(0.4, 0)
    p.begin(me, foe)
    drive(p, me, foe, 0, R + 10, { [R]: ['dive', 0, 0], [R + 10]: ['strike', 0.3, 0] })
    const ring = p.group.children[4] as Mesh
    expect(ring.visible).toBe(true)
    expect(ring.position.x).toBeCloseTo(0.3)
    const s0 = ring.scale.x
    drive(p, me, foe, R + 11, R + 30)
    expect(ring.scale.x).toBeGreaterThan(s0)
    drive(p, me, foe, R + 31, R + 60)
    expect(ring.visible).toBe(false)
    p.end(); idle(p, me, foe, 2)
    expect(lit(p.group)).toBe(0)
    expect(finite(p.group)).toBe(true)
  })
  it('disposes owned resources, even after reset', () => {
    const p = new AgnyxPower(blankTextures(), 40), me = top(0, 0), foe = top(0.4, 0)
    p.begin(me, foe); drive(p, me, foe, 0, 5)
    const rb = p.group.children[0] as Mesh, pool = p.group.children[2] as Mesh
    const g = vi.spyOn(rb.geometry, 'dispose'), pm = vi.spyOn((pool as unknown as Mesh).material as { dispose(): void }, 'dispose')
    p.reset()
    expect(() => p.dispose()).not.toThrow()
    expect(g).toHaveBeenCalled()
    expect(pm).toHaveBeenCalled()
  })
})
