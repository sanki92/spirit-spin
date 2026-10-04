import { describe, expect, it } from 'vitest'
import { keepInside, separate } from './contact'

describe('visual contact', () => {
  it('pushes overlapping tops apart until their rims just touch', () => {
    const r = separate({ x: 0, y: 0 }, { x: 0.2, y: 0 }, 0.17, 0.17)
    expect(r.touching).toBe(true)
    expect(Math.hypot(r.b.x - r.a.x, r.b.y - r.a.y)).toBeCloseTo(0.34, 6)
    expect((r.a.x + r.b.x) / 2).toBeCloseTo(0.1, 6)
  })

  it('leaves separated tops alone and reports rims that just touch', () => {
    expect(separate({ x: 0, y: 0 }, { x: 0.5, y: 0 }, 0.17, 0.17).touching).toBe(false)
    const t = separate({ x: 0, y: 0 }, { x: 0.342, y: 0 }, 0.17, 0.17)
    expect(t.touching).toBe(true)
    expect(t.b.x).toBe(0.342)
  })

  it('keeps a drawn top inside the wall', () => {
    const p = keepInside({ x: 0.89, y: 0 }, 0.17)
    expect(p.x).toBeCloseTo(0.83, 6)
    expect(keepInside({ x: 0.3, y: 0.2 }, 0.17)).toEqual({ x: 0.3, y: 0.2 })
  })
})
