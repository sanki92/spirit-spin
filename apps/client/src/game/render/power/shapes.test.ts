import { Texture } from 'three'
import { describe, expect, it } from 'vitest'
import { Ribbon, Tube } from './shapes'

const at = (a: ArrayLike<number>, i: number) => [a[i * 3]!, a[i * 3 + 1]!, a[i * 3 + 2]!]

describe('ribbon', () => {
  it('lies flat across its path with the requested width', () => {
    const r = new Ribbon(new Texture(), 3, 0.1)
    r.points[0]!.set(0, 0, 0); r.points[1]!.set(1, 0, 0); r.points[2]!.set(2, 0, 0)
    r.layout(true)
    const p = r.mesh.geometry.attributes.position!.array
    const [l, rr] = [at(p, 2), at(p, 3)]
    expect(Math.abs(l[2]! - rr[2]!)).toBeCloseTo(0.1)
    expect(l[1]).toBeCloseTo(0); expect(rr[1]).toBeCloseTo(0)
    expect(l[0]).toBeCloseTo(1); expect(rr[0]).toBeCloseTo(1)
  })
  it('stands upright when not flat', () => {
    const r = new Ribbon(new Texture(), 2, 0.2)
    r.points[0]!.set(0, 1, 0); r.points[1]!.set(1, 1, 0)
    r.layout(false)
    const p = r.mesh.geometry.attributes.position!.array
    expect(at(p, 0)[1]).toBeCloseTo(0.9); expect(at(p, 1)[1]).toBeCloseTo(1.1)
  })
})

describe('tube', () => {
  it('wraps the middle of its path at the full radius and tapers at the ends', () => {
    const t = new Tube(new Texture(), 5, 8, 0.05)
    t.points.forEach((p, i) => p.set(i * 0.1, 0.2, 0))
    t.layout()
    const p = t.mesh.geometry.attributes.position!.array
    const ring = (i: number) => Array.from({ length: 9 }, (_, k) => at(p, i * 9 + k))
    for (const v of ring(2)) expect(Math.hypot(v[1]! - 0.2, v[2]!)).toBeCloseTo(0.05)
    for (const v of ring(0)) expect(Math.hypot(v[1]! - 0.2, v[2]!)).toBeLessThan(0.03)
  })
})
