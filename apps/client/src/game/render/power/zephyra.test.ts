import { describe, expect, it, vi } from 'vitest'
import type { Mesh } from 'three'
import { ZephyraPower } from './zephyra'
import { blankTextures, drive, finite, idle, lit, top } from './testkit'

describe('Zephyra Cyclone Pull', () => {
  it('a tornado stands on Zephyra and wind spirals from the rival into it', () => {
    const p = new ZephyraPower(blankTextures(), 40), me = top(0, 0), foe = top(0.5, 0.1)
    p.begin(me, foe)
    drive(p, me, foe, 30, 60, { 30: ['vortex', 0, 0] })
    const cone = p.group.children[0] as Mesh, spiral = p.group.children[2] as Mesh
    expect(cone.visible).toBe(true)
    expect(spiral.visible).toBe(true)
    const a = spiral.geometry.attributes.position!.array, n = a.length / 3
    expect(Math.hypot((a[0]! + a[3]!) / 2 - 0.5, (a[2]! + a[5]!) / 2 + 0.1)).toBeLessThan(0.05)
    expect(Math.hypot((a[(n - 2) * 3]! + a[(n - 1) * 3]!) / 2, (a[(n - 2) * 3 + 2]! + a[(n - 1) * 3 + 2]!) / 2)).toBeLessThan(0.05)
    expect(finite(p.group)).toBe(true)
  })
  it('the fling clears the tornado within half a second', () => {
    const p = new ZephyraPower(blankTextures(), 40), me = top(0, 0), foe = top(0.5, 0)
    p.begin(me, foe)
    drive(p, me, foe, 30, 140, { 30: ['vortex', 0, 0], 140: ['fling', 0.5, 0] })
    drive(p, me, foe, 141, 172)
    expect((p.group.children[0] as Mesh).visible).toBe(false)
    p.end(); idle(p, me, foe, 2)
    expect(lit(p.group)).toBe(0)
  })
  it('disposes its geometry and materials after reset', () => {
    const p = new ZephyraPower(blankTextures(), 40), me = top(0, 0), foe = top(0.5, 0)
    p.begin(me, foe); drive(p, me, foe, 30, 40, { 30: ['vortex', 0, 0] })
    p.reset()
    const cone = p.group.children[0] as Mesh
    const geo = vi.spyOn(cone.geometry, 'dispose'), mat = vi.spyOn((cone.material as { dispose(): void }), 'dispose')
    expect(() => p.dispose()).not.toThrow()
    expect(geo).toHaveBeenCalled()
    expect(mat).toHaveBeenCalled()
  })
})
