import { describe, expect, it } from 'vitest'
import type { Mesh, Sprite } from 'three'
import { VoltfangPower } from './voltfang'
import { blankTextures, drive, finite, idle, lit, top } from './testkit'

describe('Voltfang Thunder Fang Rush', () => {
  it('lays a lightning trail that follows the top along the floor', () => {
    const p = new VoltfangPower(blankTextures(), 40), me = top(-0.4, 0), foe = top(0.4, 0)
    p.begin(me, foe)
    for (let e = 0; e < 20; e++) { me.x += 0.03; drive(p, me, foe, e, e) }
    const trail = p.group.children[0] as Mesh
    expect(trail.visible).toBe(true)
    const a = trail.geometry.attributes.position!.array
    expect((a[0]! + a[3]!) / 2).toBeCloseTo(me.x, 2)
    expect(finite(p.group)).toBe(true)
  })
  it('a bolt crashes onto the rival on each strike and is gone half a second later', () => {
    const p = new VoltfangPower(blankTextures(), 40), me = top(-0.4, 0), foe = top(0.4, 0.1)
    p.begin(me, foe)
    drive(p, me, foe, 0, 1, { 1: ['strike', 0.3, 0.05] })
    const bolt = p.group.children[1] as Sprite
    expect(bolt.visible).toBe(true)
    expect(bolt.position.x).toBeCloseTo(0.4); expect(bolt.position.z).toBeCloseTo(-0.1)
    drive(p, me, foe, 2, 32)
    expect(bolt.visible).toBe(false)
  })
  it('nothing is left after release', () => {
    const p = new VoltfangPower(blankTextures(), 40), me = top(0, 0), foe = top(0.4, 0)
    p.begin(me, foe); drive(p, me, foe, 0, 60, { 10: ['strike', 0.2, 0] }); p.end(); idle(p, me, foe, 2)
    expect(lit(p.group)).toBe(0)
  })
  it('disposes without throwing, even after reset', () => {
    const p = new VoltfangPower(blankTextures(), 40), me = top(0, 0), foe = top(0.4, 0)
    p.begin(me, foe); drive(p, me, foe, 0, 5, { 1: ['strike', 0.2, 0] })
    p.reset()
    expect(() => p.dispose()).not.toThrow()
  })
})
