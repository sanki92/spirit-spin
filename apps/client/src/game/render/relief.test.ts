import { describe, expect, it } from 'vitest'
import { centreHeight, heightUnder, parseRelief, reliefGeometry, type Relief } from './reliefGeometry'

const circle = (r: number, n = 48, cx = 0, cy = 0) => Array.from({ length: n }, (_, i) => [cx + r * Math.cos((i / n) * Math.PI * 2), cy + r * Math.sin((i / n) * Math.PI * 2)])

function ring(centre: [number, number] = [0, 0]): Relief {
  const [cx, cy] = centre
  return {
    v: 1,
    centre,
    inner: 0.3,
    outer: 0.9,
    profile: Array.from({ length: 16 }, (_, i) => (i < 5 ? 0 : i < 10 ? 0.06 : 0.14)),
    tiers: [
      { h: 0.06, wall: '#203040', shapes: [{ outer: circle(0.9, 48, cx, cy), holes: [circle(0.3, 48, cx, cy)] }] },
      { h: 0.14, wall: '#405060', shapes: [{ outer: circle(0.85, 48, cx, cy), holes: [circle(0.6, 48, cx, cy)] }] },
    ],
  }
}

describe('relief geometry', () => {
  it('rejects malformed relief data', () => {
    expect(parseRelief({})).toBeNull()
    expect(parseRelief({ v: 2, tiers: [] })).toBeNull()
    expect(parseRelief({ v: 1, centre: [0, 0], inner: 0, outer: 1, profile: [], tiers: 'x' })).toBeNull()
    expect(parseRelief({ v: 1, centre: [0, 0], inner: 0, outer: 1, profile: [], tiers: [{ h: 0.1, wall: '#000', shapes: [{ holes: [] }] }] })).toBeNull()
    expect(parseRelief(JSON.parse(JSON.stringify(ring())))).not.toBeNull()
  })

  it('builds caps and walls as two groups, as tall as the top tier', () => {
    const g = reliefGeometry(ring(), 'garage')
    expect(g.groups.map(x => x.materialIndex)).toEqual([0, 1])
    const pos = g.attributes.position!
    let maxY = -Infinity
    for (let i = 0; i < pos.count; i++) maxY = Math.max(maxY, pos.getY(i))
    expect(maxY).toBeGreaterThanOrEqual(0.14)
    expect(maxY).toBeLessThan(0.14 + 0.03)
    expect(g.attributes.color).toBeDefined()
  })

  it('keeps holes empty', () => {
    const g = reliefGeometry(ring(), 'garage'), pos = g.attributes.position!
    for (let i = 0; i < pos.count; i++) expect(Math.hypot(pos.getX(i), pos.getZ(i))).toBeGreaterThan(0.3 - 0.02)
  })

  it('battle detail uses fewer triangles than garage detail', () => {
    const tris = (d: 'garage' | 'battle') => { const g = reliefGeometry(ring(), d); return (g.index ? g.index.count : g.attributes.position!.count) / 3 }
    expect(tris('battle')).toBeLessThan(tris('garage'))
  })

  it('maps cap UVs to the art exactly and spins around the measured centre', () => {
    const c: [number, number] = [0.1, -0.2]
    const g = reliefGeometry(ring(c), 'garage'), pos = g.attributes.position!, uv = g.attributes.uv!
    let near = Infinity
    for (let i = 0; i < pos.count; i++) near = Math.min(near, Math.abs(Math.hypot(pos.getX(i), pos.getZ(i)) - 0.9))
    expect(near).toBeLessThan(0.02)
    const caps = g.groups.find(x => x.materialIndex === 0)!
    for (let i = caps.start; i < caps.start + caps.count; i++) {
      if (Math.abs(pos.getY(i) - 0.14) > 1e-6) continue
      const x = pos.getX(i) + c[0], y = -pos.getZ(i) + c[1]
      expect(uv.getX(i)).toBeCloseTo(x * 0.5 + 0.5, 5)
      expect(uv.getY(i)).toBeCloseTo(y * 0.5 + 0.5, 5)
    }
  })

  it('colours each wall point from the art at that spot when a sampler is given', () => {
    const sample = (u: number, _v: number): [number, number, number] => (u < 0.5 ? [1, 0, 0] : [0, 0, 1])
    const g = reliefGeometry(ring(), 'garage', sample), pos = g.attributes.position!, col = g.attributes.color!
    const walls = g.groups.find(x => x.materialIndex === 1)!
    let left = 0, right = 0
    for (let i = walls.start; i < walls.start + walls.count; i++) {
      const x = pos.getX(i)
      if (x < -0.2) { expect(col.getX(i)).toBeGreaterThan(col.getZ(i)); left++ }
      if (x > 0.2) { expect(col.getZ(i)).toBeGreaterThan(col.getX(i)); right++ }
    }
    expect(left).toBeGreaterThan(0)
    expect(right).toBeGreaterThan(0)
  })

  it('reads heights from the radial profile', () => {
    const r = ring()
    expect(centreHeight(r)).toBe(0)
    expect(heightUnder(r, 0.5)).toBe(0.14)
    expect(heightUnder(r, 0.32)).toBe(0.14)
    expect(heightUnder({ ...r, profile: r.profile.map((v, i) => (i >= 10 ? 0.06 : v)) }, 0.32)).toBe(0.06)
  })
})
