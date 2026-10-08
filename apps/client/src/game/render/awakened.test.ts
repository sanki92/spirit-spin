import { AdditiveBlending, BufferGeometry, Color, Texture, type Mesh, type MeshBasicMaterial, type Sprite } from 'three'
import { describe, expect, it, vi } from 'vitest'
import { Eruption, pillarStyle } from './power/eruption'
import { blankTextures, lit } from './power/testkit'
import { SpiritBillboard } from './SpiritBillboard'

vi.mock('./partMesh', () => ({ cachedRing: () => ({ geometry: new BufferGeometry(), edge: new Color(1, 1, 1) }) }))

const { TopMesh } = await import('./TopMesh')

const radii = (m: Mesh, x: number, y: number) => {
  const a = m.geometry.attributes.position!.array as Float32Array
  let r = 0
  for (let i = 0; i < a.length; i += 3) r = Math.max(r, Math.hypot(a[i]! - x, a[i + 2]! + y))
  return r
}

describe('awakened pillar', () => {
  it('is a double helix: four ribbons, the inner pair tighter, gold-white and additive', () => {
    const p = new Eruption(pillarStyle('shadow', blankTextures(), 0xff2fa0), true)
    p.fire()
    for (let i = 0; i < 20; i++) p.update(1 / 60, 0.2, -0.1, false)
    expect(lit(p.group)).toBe(4)
    const m = p.group.children as Mesh[]
    expect(m.length).toBe(4)
    expect(radii(m[2]!, 0.2, -0.1)).toBeLessThan(radii(m[0]!, 0.2, -0.1))
    const core = m[2]!.material as MeshBasicMaterial
    expect(core.color.getHex()).toBe(0xffe9a8)
    expect(core.blending).toBe(AdditiveBlending)
    expect((m[0]!.material as MeshBasicMaterial).color.getHex()).toBe(0xff2fa0)
  })
  it('a plain pillar keeps two ribbons and the form tint overrides the element tint', () => {
    expect(new Eruption(pillarStyle('fire', blankTextures())).group.children.length).toBe(2)
    expect(pillarStyle('shadow', blankTextures(), 0x123456).tint).toBe(0x123456)
    expect(pillarStyle('shadow', blankTextures()).tint).toBe(0x9a1a7a)
  })
  it('dispose frees all four ribbons', () => {
    const p = new Eruption(pillarStyle('wind', blankTextures()), true)
    let freed = 0
    for (const c of p.group.children) {
      const m = c as Mesh
      m.geometry.addEventListener('dispose', () => freed++)
      ;(m.material as MeshBasicMaterial).addEventListener('dispose', () => freed++)
    }
    p.dispose()
    expect(freed).toBe(8)
  })
})

const make = (awakened: boolean) => {
  const bb = new SpiritBillboard(new Texture(), new Texture(), '#ff7a3a', null, pillarStyle('fire', blankTextures()), awakened)
  return { bb, beast: (bb as unknown as { beast: Sprite }).beast, aura: (bb as unknown as { aura: Sprite }).aura }
}
const run = (bb: SpiritBillboard, secs: number, still = false, each?: () => void) => {
  for (let t = 0; t < secs - 1e-9; t += 1 / 60) { bb.update(0.1, 0.1, 0.03, 0.4, 0.4, 1 / 60, still); each?.() }
}

describe('awakened billboard', () => {
  it('is 25% larger with a brighter rim', () => {
    const a = make(false), b = make(true)
    for (const m of [a, b]) { m.bb.show(true); run(m.bb, 1.6, true) }
    expect(b.beast.scale.y / a.beast.scale.y).toBeCloseTo(1.25, 2)
    expect(b.aura.material.opacity).toBeGreaterThan(a.aura.material.opacity)
  })
  it('reduced motion holds the beast perfectly still', () => {
    const { bb } = make(false)
    bb.show(true)
    run(bb, 1.2, true)
    const ys = new Set<number>()
    run(bb, 2, true, () => ys.add(bb.body.position.y))
    expect(ys.size).toBe(1)
    const live = make(false)
    live.bb.show(true)
    run(live.bb, 1.2)
    const ls = new Set<number>()
    run(live.bb, 2, false, () => ls.add(live.bb.body.position.y))
    expect(ls.size).toBeGreaterThan(10)
  })
})

describe('aura ring reduced motion', () => {
  it('does not spin when still', () => {
    const spin = (still: boolean) => {
      const top = new TopMesh({ blade: new Texture(), disc: new Texture(), emblem: new Texture(), aura: new Texture() }, 0.1, 'attack', '#ff7a3a')
      for (let i = 0; i < 30; i++) top.update(0.3, 0.2, 1, 0, true, 1 / 60, true, still)
      return top.glow.quaternion.clone()
    }
    const a = spin(true), b = spin(true), c = spin(false)
    expect(a.angleTo(b)).toBeLessThan(1e-6)
    expect(a.angleTo(c)).toBeGreaterThan(0.1)
  })
})
