import { TUNING } from '@spirit/core'
import { Color, Group, Matrix4, Vector3, type InstancedMesh, type Mesh, type MeshBasicMaterial, type Sprite } from 'three'
import { describe, expect, it } from 'vitest'
import { AegironPower } from './aegiron'
import { AgnyxPower } from './agnyx'
import { NagaraPower } from './nagara'
import { POWERS } from './index'
import { PowerFx, type PowerFactory } from './PowerFx'
import { UmbraxPower } from './umbrax'
import { VoltfangPower } from './voltfang'
import { ZephyraPower } from './zephyra'
import { blankTextures, drive, top } from './testkit'

const R = TUNING.tech.riseTicks
const topY = (m: Mesh) => {
  const a = m.geometry.attributes.position!.array as Float32Array
  let y = 0
  for (let i = 1; i < a.length; i += 3) y = Math.max(y, a[i]!)
  return y
}
const reach = (m: Mesh) => {
  const a = m.geometry.attributes.position!.array as Float32Array
  let r = 0
  for (let i = 0; i < a.length; i += 3) r = Math.max(r, Math.hypot(a[i]!, a[i + 2]!))
  return r
}
const sprites = (p: { group: Group }) => p.group.children.filter(c => c.visible && (c as Sprite).isSprite) as Sprite[]

describe('ultimate power variants', () => {
  it('Aegiron raises 14 shards instead of 10', () => {
    for (const [ult, n] of [[false, 10], [true, 14]] as const) {
      const p = new AegironPower(blankTextures(), 40, ult), me = top(0, 0), foe = top(0.5, 0)
      p.begin(me, foe)
      drive(p, me, foe, 0, 20, { 0: ['anchor', 0, 0] })
      const s = p.group.children[0] as InstancedMesh
      expect(s.count).toBe(n)
      for (let i = 0; i < n; i++) expect(Number.isFinite(new Vector3().setFromMatrixPosition(new Matrix4().fromArray(s.instanceMatrix.array, i * 16)).x)).toBe(true)
    }
  })
  it('Voltfang calls three staggered sky bolts, one without the ultimate', () => {
    const run = (ult: boolean) => {
      const p = new VoltfangPower(blankTextures(), 40, ult), me = top(-0.4, 0), foe = top(0.4, 0.1)
      p.begin(me, foe)
      drive(p, me, foe, 0, 1, { 1: ['strike', 0.3, 0.05] })
      const first = sprites(p).length
      drive(p, me, foe, 2, 8)
      return { p, first, later: sprites(p) }
    }
    expect(run(false).later.length).toBe(1)
    const u = run(true)
    expect(u.first).toBe(1)
    expect(u.later.length).toBe(3)
    expect(new Set(u.later.map(b => b.position.x.toFixed(3))).size).toBe(3)
    for (const b of u.later) expect(Math.abs(b.position.x - 0.4)).toBeLessThan(0.15)
    drive(u.p, top(-0.4, 0), top(0.4, 0.1), 9, 40)
    expect(sprites(u.p).length).toBe(0)
  })
  it('Nagara coils a second serpent half a turn behind', () => {
    const run = (ult: boolean) => {
      const p = new NagaraPower(blankTextures(), 40, ult), me = top(-0.3, 0), foe = top(0.1, 0)
      p.begin(me, foe)
      drive(p, me, foe, 0, 30)
      return p
    }
    const tubes = (p: NagaraPower) => p.group.children.filter(c => (c as Mesh).isMesh && c.visible && (c as Mesh).geometry.attributes.position!.count > 100) as Mesh[]
    expect(tubes(run(false)).length).toBe(1)
    const two = tubes(run(true))
    expect(two.length).toBe(2)
    const pa = two[0]!.geometry.attributes.position!.array as Float32Array, pb = two[1]!.geometry.attributes.position!.array as Float32Array
    expect(Math.hypot(pa[0]! - pb[0]!, pa[2]! - pb[2]!)).toBeGreaterThan(0.05)
    expect(reach(two[1]!)).toBeGreaterThan(0)
  })
  it('Agnyx tornado is 1.3 times taller and wider', () => {
    const run = (ult: boolean) => {
      const p = new AgnyxPower(blankTextures(), 40, ult), me = top(0, 0), foe = top(0.4, 0)
      p.begin(me, foe)
      drive(p, me, foe, 0, R - 2)
      return p.group.children[0] as Mesh
    }
    const n = run(false), u = run(true)
    expect(topY(u) / topY(n)).toBeCloseTo(1.3, 1)
    expect(reach(u) / reach(n)).toBeGreaterThan(1.2)
  })
  it('Zephyra tornado cone is 1.3 times wider', () => {
    for (const [ult, w] of [[false, 1], [true, 1.3]] as const) {
      const p = new ZephyraPower(blankTextures(), 40, ult), me = top(0, 0), foe = top(0.5, 0)
      p.begin(me, foe)
      drive(p, me, foe, 30, 50, { 30: ['vortex', 0, 0] })
      const cone = p.group.children[0] as Mesh
      expect(cone.visible).toBe(true)
      expect(cone.scale.x).toBeCloseTo(w)
      expect(cone.scale.z).toBeCloseTo(w)
    }
  })
  it('Umbrax pounces with six claws in a ring around the rival', () => {
    const claws = (ult: boolean) => {
      const p = new UmbraxPower(blankTextures(), ult), me = top(-0.2, 0), foe = top(0.3, 0)
      p.begin(me, foe)
      drive(p, me, foe, 0, TUNING.tech.pounceAt + 6, { [TUNING.tech.pounceAt]: ['pounce', 0.4, 0] })
      return p.group.children.filter(c => (c as Sprite).isSprite && c.visible && (c as Sprite).scale.x === 0.16) as Sprite[]
    }
    expect(claws(false).length).toBe(3)
    const six = claws(true)
    expect(six.length).toBe(6)
    for (const c of six) expect(Math.hypot(c.position.x - 0.3, c.position.z)).toBeLessThan(0.14)
    expect(new Set(six.map(c => c.position.x.toFixed(3) + c.position.z.toFixed(3))).size).toBe(6)
  })
  it('every ultimate variant disposes what it made', () => {
    const tex = blankTextures()
    for (const f of Object.values(POWERS)) {
      const p = f(tex, 40, true, 0xff00ff)
      const mats = new Set<MeshBasicMaterial>()
      let freed = 0
      p.group.traverse(o => { for (const mat of ([] as unknown[]).concat((o as Mesh).material ?? []) as MeshBasicMaterial[]) mats.add(mat) })
      for (const mat of mats) mat.addEventListener('dispose', () => freed++)
      p.dispose()
      expect(freed).toBe(mats.size)
    }
  })
})

describe('power manager ultimates', () => {
  it('passes the ultimate flag and tint to each side separately', () => {
    const seen: unknown[][] = []
    const f: PowerFactory = (_t, _c, ult, tint) => { seen.push([ult, tint]); return { group: new Group(), begin() {}, cue() {}, update() {}, end() {}, reset() {}, dispose() {} } }
    const fx = new PowerFx(blankTextures(), 20, { voltfang: f, aegiron: f })
    fx.setBeasts(['voltfang', 'aegiron'], [true, false], [0xff0000, null])
    expect(seen).toEqual([[true, 0xff0000], [false, null]])
    seen.length = 0
    fx.setBeasts(['voltfang', 'aegiron'])
    expect(seen).toEqual([[false, null], [false, null]])
  })
  it('tints the power meshes of the tinted side only', () => {
    const fx = new PowerFx(blankTextures(), 20, POWERS)
    fx.setBeasts(['voltfang', 'umbrax'], [false, true], [0x00ff80, null])
    const want = new Color(0x00ff80)
    const count = (g: Group, tinted: boolean) => {
      let n = 0
      g.traverse(o => { const m = (o as Mesh).material as MeshBasicMaterial | undefined; if (m?.color && m.color.equals(want) === tinted) n++ })
      return n
    }
    expect(count(fx.group.children[0] as Group, true)).toBeGreaterThan(1)
    expect(count(fx.group.children[1] as Group, true)).toBe(0)
    expect(count(fx.group.children[1] as Group, false)).toBeGreaterThan(1)
  })
  it('keeps the quiet fallback for beasts with no power', () => {
    const fx = new PowerFx(blankTextures(), 20, {})
    expect(() => fx.setBeasts(['nagara', 'umbrax'], [true, true], [0xffffff, 0xffffff])).not.toThrow()
  })
})
