import { TUNING } from '@spirit/core'
import { describe, expect, it, vi } from 'vitest'
import type { Mesh, Sprite } from 'three'
import { UmbraxPower } from './umbrax'
import { blankTextures, drive, finite, idle, lit, top } from './testkit'

const P = TUNING.tech.pounceAt

describe('Umbrax Shadow Pounce', () => {
  it('a shadow pool grows under Umbrax before the pounce', () => {
    const p = new UmbraxPower(blankTextures()), me = top(-0.2, 0), foe = top(0.3, 0)
    p.begin(me, foe)
    drive(p, me, foe, 0, P - 1)
    const pool = p.group.children[0] as Mesh
    expect(pool.visible).toBe(true)
    expect(pool.position.x).toBeCloseTo(-0.2)
  })
  it('the pounce opens a pool under the rival with claws rising from it', () => {
    const p = new UmbraxPower(blankTextures()), me = top(-0.2, 0), foe = top(0.3, 0)
    p.begin(me, foe)
    drive(p, me, foe, 0, P + 6, { [P]: ['pounce', 0.4, 0] })
    const poolB = p.group.children[1] as Mesh, claw = p.group.children[2] as Sprite
    expect(poolB.visible).toBe(true)
    expect(poolB.position.x).toBeCloseTo(0.3)
    expect(claw.visible).toBe(true)
    expect(finite(p.group)).toBe(true)
  })
  it('each strike flashes a claw slash, and nothing is left after release', () => {
    const p = new UmbraxPower(blankTextures()), me = top(-0.2, 0), foe = top(0.3, 0)
    p.begin(me, foe)
    drive(p, me, foe, 0, P + 12, { [P]: ['pounce', 0.4, 0], [P + 12]: ['strike', 0.35, 0] })
    expect((p.group.children[5] as Sprite).visible).toBe(true)
    p.end(); idle(p, me, foe, 2)
    expect(lit(p.group)).toBe(0)
  })
  it('disposes its materials after reset', () => {
    const p = new UmbraxPower(blankTextures()), me = top(-0.2, 0), foe = top(0.3, 0)
    p.begin(me, foe); drive(p, me, foe, 0, 5)
    p.reset()
    const pool = p.group.children[0] as Mesh, claw = p.group.children[2] as Sprite
    const a = vi.spyOn((pool.material as { dispose(): void }), 'dispose'), b = vi.spyOn(claw.material, 'dispose')
    expect(() => p.dispose()).not.toThrow()
    expect(a).toHaveBeenCalled()
    expect(b).toHaveBeenCalled()
  })
})
