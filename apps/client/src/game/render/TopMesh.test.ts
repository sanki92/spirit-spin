import { BufferGeometry, Color, Texture, type Material, type Mesh } from 'three'
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
