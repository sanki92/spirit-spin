import { TUNING } from '@spirit/core'
import { Matrix4, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { AegironPower } from './aegiron'
import { blankTextures, drive, finite, idle, lit, top } from './testkit'

const S = TUNING.tech.slamAt
const shardsOf = (p: AegironPower) => p.group.children[0] as import('three').InstancedMesh
const rocksOf = (p: AegironPower) => p.group.children[1] as import('three').InstancedMesh
const posOf = (m: import('three').InstancedMesh, i: number) => new Vector3().setFromMatrixPosition(new Matrix4().fromArray(m.instanceMatrix.array, i * 16))

describe('Aegiron Bastion Slam', () => {
  it('raises a ring of crystal shards around the anchor', () => {
    const p = new AegironPower(blankTextures(), 40), me = top(0, 0), foe = top(0.5, 0)
    p.begin(me, foe)
    drive(p, me, foe, 0, 20, { 0: ['anchor', 0, 0] })
    const s = shardsOf(p)
    expect(s.count).toBe(10)
    for (let i = 0; i < 10; i++) { const v = posOf(s, i); expect(Math.hypot(v.x, v.z)).toBeLessThan(0.3); expect(Math.hypot(v.x, v.z)).toBeGreaterThan(0.15) }
    expect(finite(p.group)).toBe(true)
  })
  it('the shards land on the rival as the shockwave hits, and scatter rock there', () => {
    const p = new AegironPower(blankTextures(), 40), me = top(0, 0), foe = top(0.5, 0)
    p.begin(me, foe)
    drive(p, me, foe, 0, S, { 0: ['anchor', 0, 0], [S]: ['shockwave', 0, 0] })
    expect(shardsOf(p).count).toBe(0)
    const r = rocksOf(p)
    expect(r.count).toBeGreaterThan(0)
    const v = posOf(r, 0)
    expect(Math.hypot(v.x - 0.5, v.z)).toBeLessThan(0.15)
  })
  it('leaves a floor scar that fades, and nothing after release', () => {
    const p = new AegironPower(blankTextures(), 40), me = top(0, 0), foe = top(0.5, 0)
    p.begin(me, foe)
    drive(p, me, foe, 0, S + 10, { 0: ['anchor', 0, 0], [S]: ['shockwave', 0, 0] })
    expect(lit(p.group)).toBeGreaterThan(0)
    p.end()
    idle(p, me, foe, 4)
    expect(lit(p.group)).toBe(0)
    expect(finite(p.group)).toBe(true)
  })
  it('disposes without throwing, even after reset', () => {
    const p = new AegironPower(blankTextures(), 40), me = top(0, 0), foe = top(0.5, 0)
    p.begin(me, foe)
    drive(p, me, foe, 0, S, { 0: ['anchor', 0, 0], [S]: ['shockwave', 0, 0] })
    p.reset()
    expect(() => p.dispose()).not.toThrow()
  })
})
