import { describe, expect, it } from 'vitest'
import { shopRotation } from './shop'


describe('shop restock', () => {
  const ids = (xs: { id: string }[]) => xs.map(x => x.id)
  it('a new day brings different parts whenever the pool allows it', () => {
    for (const tower of [12, 20, 50]) {
      for (const day of ['2026-10-04', '2026-10-05', '2026-10-31', '2027-01-01']) {
        const prev = new Date(`${day}T00:00:00Z`)
        prev.setUTCDate(prev.getUTCDate() - 1)
        const a = ids(shopRotation(prev.toISOString().slice(0, 10), 6, tower)), b = ids(shopRotation(day, 6, tower))
        const pool = shopRotation(day, 999, tower).length
        const overlap = a.filter(x => b.includes(x)).length
        expect(overlap, `tower ${tower} ${day}`).toBeLessThanOrEqual(Math.max(0, 12 - pool))
      }
    }
  }, 30000)
  it('never offers parts the player already owns, and stays deterministic', () => {
    const owned = new Set(ids(shopRotation('2026-10-05', 3, 50)))
    const r = shopRotation('2026-10-05', 6, 50, owned)
    expect(r).toHaveLength(6)
    expect(ids(r).some(id => owned.has(id))).toBe(false)
    expect(ids(shopRotation('2026-10-05', 6, 50, owned))).toEqual(ids(r))
  })
  it('a pool smaller than the shop shows what is left instead of repeating', () => {
    const all = ids(shopRotation('2026-10-05', 999, 50))
    const owned = new Set(all.slice(2))
    expect(shopRotation('2026-10-05', 6, 50, owned)).toHaveLength(2)
  })
})
