import { describe, expect, it } from 'vitest'
import type { InstancedMesh, Mesh } from 'three'
import { NagaraPower } from './nagara'
import { blankTextures, drive, finite, idle, lit, top } from './testkit'

describe('Nagara Tidal Coil', () => {
  it('a water serpent coils around the rival with its head at Nagara', () => {
    const p = new NagaraPower(blankTextures(), 40), me = top(-0.3, 0), foe = top(0.1, 0)
    p.begin(me, foe)
    drive(p, me, foe, 0, 30, { 0: ['orbit', -0.3, 0] })
    const tube = p.group.children[0] as Mesh
    expect(tube.visible).toBe(true)
    const a = tube.geometry.attributes.position!.array
    let cx = 0, cz = 0
    for (let k = 0; k < 9; k++) { cx += a[k * 3]!; cz += a[k * 3 + 2]! }
    expect(Math.hypot(cx / 9 - me.x, cz / 9 + me.y)).toBeLessThan(0.05)
    expect(finite(p.group)).toBe(true)
  })
  it('the fling bursts a splash and the coil collapses', () => {
    const p = new NagaraPower(blankTextures(), 40), me = top(-0.3, 0), foe = top(0.1, 0)
    p.begin(me, foe)
    drive(p, me, foe, 0, 140, { 0: ['orbit', -0.3, 0], 140: ['fling', 0.1, 0] })
    expect((p.group.children[2] as InstancedMesh).count).toBeGreaterThan(0)
    drive(p, me, foe, 141, 170)
    expect((p.group.children[0] as Mesh).visible).toBe(false)
  })
  it('nothing is left after release', () => {
    const p = new NagaraPower(blankTextures(), 40), me = top(-0.3, 0), foe = top(0.1, 0)
    p.begin(me, foe); drive(p, me, foe, 0, 60); p.end(); idle(p, me, foe, 2)
    expect(lit(p.group)).toBe(0)
  })
  it('disposes without throwing, even after reset', () => {
    const p = new NagaraPower(blankTextures(), 40), me = top(0, 0), foe = top(0.4, 0)
    p.begin(me, foe); drive(p, me, foe, 0, 5)
    p.reset()
    expect(() => p.dispose()).not.toThrow()
  })
})
