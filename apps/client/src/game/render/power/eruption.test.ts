import { NormalBlending, Texture, type Mesh, type MeshBasicMaterial } from 'three'
import { describe, expect, it } from 'vitest'
import { Eruption, pillarStyle } from './eruption'
import type { PowerTextures } from './PowerFx'
import { blankTextures, finite, lit } from './testkit'

const run = (p: Eruption, from: number, to: number, still = false, x = 0.2, y = -0.1) => {
  let top = 0
  for (let t = from; t < to - 1e-9; t += 1 / 60) {
    p.update(1 / 60, x, y, still)
    for (const c of p.group.children) {
      const a = (c as Mesh).geometry.attributes.position!.array as Float32Array
      if (c.visible) for (let i = 1; i < a.length; i += 3) top = Math.max(top, a[i]!)
    }
  }
  return top
}

describe('eruption pillar', () => {
  it('spirals up out of the top within 0.4 s and is gone by 1 s', () => {
    const p = new Eruption(pillarStyle('fire', blankTextures()))
    expect(lit(p.group)).toBe(0)
    p.fire()
    const early = run(p, 0, 0.1)
    expect(lit(p.group)).toBe(2)
    const peak = run(p, 0.1, 0.4)
    expect(peak).toBeGreaterThan(0.8)
    expect(peak).toBeGreaterThan(early + 0.3)
    expect(lit(p.group)).toBe(2)
    expect(finite(p.group)).toBe(true)
    run(p, 0.4, 1)
    expect(lit(p.group)).toBe(0)
  })
  it('stays centred on the top', () => {
    const p = new Eruption(pillarStyle('water', blankTextures()))
    p.fire()
    run(p, 0, 0.3, false, 0.3, 0.2)
    for (const c of p.group.children) {
      const a = (c as Mesh).geometry.attributes.position!.array as Float32Array
      for (let i = 0; i < a.length; i += 3) expect(Math.hypot(a[i]! - 0.3, a[i + 2]! + 0.2)).toBeLessThan(0.2)
    }
  })
  it('reduced motion shows a short static column', () => {
    const p = new Eruption(pillarStyle('lightning', blankTextures()))
    p.fire()
    run(p, 0, 1 / 60, true)
    const a = Float32Array.from((p.group.children[0] as Mesh).geometry.attributes.position!.array as Float32Array)
    run(p, 1 / 60, 0.2, true)
    expect(Array.from((p.group.children[0] as Mesh).geometry.attributes.position!.array as Float32Array)).toEqual(Array.from(a))
    run(p, 0.2, 0.6, true)
    expect(lit(p.group)).toBe(0)
  })
  it('maps every element to a texture and shadow to a dark normal-blended ribbon', () => {
    const t = Object.fromEntries(['lightning', 'fire', 'wind', 'water', 'crystal'].map(k => [k, new Texture()])) as unknown as PowerTextures
    for (const el of ['lightning', 'fire', 'wind', 'water', 'crystal', 'shadow'] as const) expect(pillarStyle(el, t).tex).toBeInstanceOf(Texture)
    expect(pillarStyle('fire', t).tex).toBe(t.fire)
    expect(pillarStyle('crystal', t).tex).toBe(t.crystal)
    const s = new Eruption(pillarStyle('shadow', t))
    const m = (s.group.children[0] as Mesh).material as MeshBasicMaterial
    expect(m.blending).toBe(NormalBlending)
    expect(m.color.r + m.color.g + m.color.b).toBeLessThan(1.6)
  })
  it('reset hides it and dispose frees every geometry and material', () => {
    const p = new Eruption(pillarStyle('wind', blankTextures()))
    p.fire()
    run(p, 0, 0.2)
    p.reset()
    expect(lit(p.group)).toBe(0)
    let freed = 0
    for (const c of p.group.children) {
      const m = c as Mesh
      m.geometry.addEventListener('dispose', () => freed++)
      ;(m.material as MeshBasicMaterial).addEventListener('dispose', () => freed++)
    }
    p.dispose()
    expect(freed).toBe(4)
  })
})
