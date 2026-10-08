import { BufferGeometry, Color, Texture, type Material, type Mesh, type MeshBasicMaterial } from 'three'
import { describe, expect, it, vi } from 'vitest'

vi.mock('./partMesh', () => ({ cachedRing: () => ({ geometry: new BufferGeometry(), edge: new Color(1, 1, 1) }) }))

const { TopMesh } = await import('./TopMesh')

describe('top fading during a phase ability', () => {
  it('dims every part, including the blade and disc that carry two materials, without throwing', () => {
    const top = new TopMesh({ blade: new Texture(), disc: new Texture(), emblem: new Texture() }, 0.1, 'attack')
    expect(() => top.fade(0.18, 1)).not.toThrow()
    const spinner = (top as unknown as { spinner: { traverse(f: (o: Mesh) => void): void } }).spinner
    const mats: Material[] = []
    spinner.traverse(o => { if (o.material) mats.push(...(Array.isArray(o.material) ? o.material : [o.material])) })
    expect(mats.length).toBeGreaterThan(4)
    const base = mats.map(m => m.userData.base as number)
    mats.forEach((m, i) => expect(m.opacity).toBeCloseTo(base[i]! * 0.18, 3))
    top.fade(1, 1)
    mats.forEach((m, i) => expect(m.opacity).toBeCloseTo(base[i]!, 3))
  })
})

describe('spirit aura ring', () => {
  it('is a small ring around the top, not a wide floor disc, and shrinks as the top lifts', () => {
    const ring = new Texture()
    const top = new TopMesh({ blade: new Texture(), disc: new Texture(), emblem: new Texture(), aura: ring }, 0.1, 'attack', '#ff7a3a')
    for (let i = 0; i < 60; i++) top.update(0.3, 0.2, 1, 0, true, 1 / 60, true)
    const m = top.glow.material as MeshBasicMaterial
    expect(m.map).toBe(ring)
    expect(m.opacity).toBeCloseTo(0.6, 1)
    expect(m.color.getHexString()).toBe('ff7a3a')
    expect(top.glow.position.x).toBeCloseTo(0.3)
    expect(top.glow.position.z).toBeCloseTo(-0.2)
    const flat = top.glow.scale.x
    expect(flat).toBeLessThan(top.radius * 4.5)
    const y0 = top.group.position.y
    top.raise(0.15)
    expect(top.group.position.y).toBeCloseTo(y0 + 0.15)
    const mid = top.glow.scale.x
    top.update(0.3, 0.2, 1, 0, true, 1 / 60, true)
    top.raise(0.3)
    expect(mid).toBeLessThan(flat)
    expect(top.glow.scale.x).toBeLessThan(mid)
    expect(top.glow.scale.x).toBeLessThan(flat * 0.3)
    top.update(0.3, 0.2, 1, 0, true, 1 / 60, true)
    expect(top.glow.scale.x).toBeCloseTo(flat)
  })
})
