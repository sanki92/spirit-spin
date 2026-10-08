import { Texture, type Sprite } from 'three'
import { describe, expect, it } from 'vitest'
import { SpiritBillboard } from './SpiritBillboard'
import { pillarStyle } from './power/eruption'
import { blankTextures } from './power/testkit'

const make = () => {
  const base = new Texture(), attack = new Texture()
  const bb = new SpiritBillboard(base, new Texture(), '#ff7a3a', attack, pillarStyle('fire', blankTextures()))
  const beast = (bb as unknown as { beast: Sprite }).beast
  const aura = (bb as unknown as { aura: Sprite }).aura
  return { bb, base, attack, beast, aura }
}

const step = (bb: SpiritBillboard, secs: number, path: (t: number) => [number, number], t0 = 0, each?: (t: number) => void) => {
  for (let t = t0; t < t0 + secs - 1e-9; t += 1 / 60) {
    const [x, y] = path(t)
    bb.update(x, y, 0.03, 0.4, 0.4, 1 / 60, false)
    each?.(t)
  }
}

describe('spirit billboard', () => {
  it('bursts out of the top centre, punches past full size and settles with the attack pose inside the 1 s summon', () => {
    const { bb, base, attack, beast } = make()
    bb.show(true)
    let peak = 0, seen = false
    step(bb, 1, () => [0.1, -0.2], 0, () => {
      const s = beast.scale.y / 1.15
      peak = Math.max(peak, s)
      if (beast.material.map === attack) seen = true
      if (!seen) expect(beast.material.map).toBe(base)
      expect(Math.abs(bb.body.position.x - 0.1)).toBeLessThan(0.02)
      expect(Math.abs(bb.body.position.z - 0.2)).toBeLessThan(0.02)
    })
    expect(seen).toBe(true)
    expect(peak).toBeGreaterThan(1.08)
    expect(peak).toBeLessThan(1.16)
    expect(beast.scale.y / 1.15).toBeCloseTo(1, 1)
    expect(bb.summoning).toBe(false)
  })
  it('hovers bonded above its moving top during the takeover at about 70% opacity with a bright rim', () => {
    const { bb, beast, aura } = make()
    bb.show(true)
    step(bb, 1, () => [0, 0])
    const path = (t: number): [number, number] => [Math.cos(t * 3) * 0.5, Math.sin(t * 3) * 0.5]
    step(bb, 2, path, 1, t => {
      const [x, y] = path(t)
      expect(Math.abs(bb.body.position.x - x)).toBeLessThan(0.02)
      expect(Math.abs(bb.body.position.z + y)).toBeLessThan(0.02)
      expect(bb.body.position.y).toBeGreaterThan(0.1)
    })
    expect(beast.material.opacity).toBeCloseTo(0.7, 1)
    expect(aura.material.opacity).toBeGreaterThan(0.25)
    bb.show(false)
    step(bb, 0.5, () => [0, 0])
    expect(bb.group.visible).toBe(false)
  })
  it('starts the pillar with the summon and a cancelled summon hides everything', () => {
    const { bb } = make()
    bb.show(true)
    step(bb, 0.1, () => [0, 0])
    expect(bb.pillar.group.children.some(c => c.visible)).toBe(true)
    expect(bb.summoning).toBe(true)
    bb.show(false)
    expect(bb.group.visible).toBe(false)
    bb.reset()
    expect(bb.pillar.group.children.some(c => c.visible)).toBe(false)
  })
})
