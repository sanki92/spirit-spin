import { describe, expect, it } from 'vitest'
import type { Relief } from './reliefGeometry'
import { loadRelief, reliefFor, stackHeights } from './reliefStore'

const part = (inner: number, profile: number[], tiers: number[] = [0.06]): Relief => ({
  v: 1, centre: [0, 0], inner, outer: 0.9, profile,
  tiers: tiers.map(h => ({ h, wall: '#222', shapes: [{ outer: [[0.9, 0], [0, 0.9], [-0.9, 0], [0, -0.9]], holes: [] }] })),
})
const flat = { blade: 0.075, disc: 0.06 }
const garage = { discScaleXZ: 0.86, discScaleY: 1, emblemR: 0.31, gap: 0.004, flat }

describe('stacking relief parts', () => {
  it('lifts the blade above the disc wherever the disc lies under the blade ring', () => {
    const disc = part(0.1, [0, 0.14, 0.14, 0.06, 0.06, 0.06, 0.06, 0.06, 0.1, 0.1, 0.1, 0.1, 0.1, 0.06, 0, 0])
    const blade = part(0.32, Array(16).fill(0.21))
    const s = stackHeights(blade, disc, garage)
    expect(s.bladeLift).toBeCloseTo(0.1 + 0.004, 6)
    const low = stackHeights(blade, { ...disc, profile: disc.profile.map(() => 0.06) }, garage)
    expect(low.bladeLift).toBeCloseTo(0.06 + 0.004, 6)
  })

  it('puts the emblem just above the disc hub, never inside it', () => {
    const disc = part(0.1, [0.14, 0.14, 0.14, 0.14, 0.06, 0.06, 0.06, 0.06, 0.06, 0.06, 0.06, 0.06, 0.06, 0.06, 0, 0])
    const blade = part(0.45, Array(16).fill(0.21))
    const s = stackHeights(blade, disc, garage)
    expect(s.emblemLift).toBeGreaterThanOrEqual(0.14 + 0.004 - 1e-9)
    expect(s.emblemLift).toBeLessThan(s.bladeLift + 0.21)
  })

  it('keeps the emblem above the blade when the blade hole is narrower than the emblem', () => {
    const disc = part(0.1, Array(16).fill(0.06))
    const blade = part(0.25, [0, 0, 0, 0, 0.1, 0.1, 0.21, 0.21, 0.21, 0.21, 0.21, 0.21, 0.21, 0.21, 0, 0])
    const s = stackHeights(blade, disc, garage)
    expect(s.emblemLift).toBeGreaterThanOrEqual(s.bladeLift + 0.1 + 0.004 - 1e-9)
  })

  it('falls back to the flat slab heights when relief is missing', () => {
    const s = stackHeights(null, null, garage)
    expect(s.bladeLift).toBeCloseTo(flat.disc + 0.004, 6)
    expect(s.bladeTop).toBeCloseTo(flat.blade, 6)
  })
})

describe('loading relief', () => {
  it('stores parsed relief and stores nothing for missing or malformed data', async () => {
    const good = part(0.3, Array(16).fill(0.06))
    expect(await loadRelief('blade-a', async () => good)).not.toBeNull()
    expect(reliefFor('blade-a')).not.toBeNull()
    expect(await loadRelief('blade-b', async () => ({ v: 9 }))).toBeNull()
    expect(reliefFor('blade-b')).toBeNull()
    expect(await loadRelief('blade-c', async () => { throw new Error('offline') })).toBeNull()
    expect(reliefFor('blade-c')).toBeNull()
  })
})
