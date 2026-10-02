import { describe, expect, it } from 'vitest'
import { elo, roundRobin, swissRound, type Standing } from './league'

const key = (a: string, b: string) => [a, b].sort().join('|')

describe('league', () => {
  it('round robin meets every pair exactly once, with one bye each for odd counts', () => {
    for (const n of [4, 5, 6]) {
      const ids = [...Array(n)].map((_, i) => `p${i}`)
      const rounds = roundRobin(ids)
      expect(rounds).toHaveLength(n % 2 ? n : n - 1)
      const seen = new Set<string>()
      const byes = new Map<string, number>()
      for (const round of rounds) {
        const inRound = new Set<string>()
        for (const [a, b] of round) {
          expect(inRound.has(a)).toBe(false)
          inRound.add(a)
          if (b === null) { byes.set(a, (byes.get(a) ?? 0) + 1); continue }
          inRound.add(b)
          expect(seen.has(key(a, b))).toBe(false)
          seen.add(key(a, b))
        }
      }
      expect(seen.size).toBe((n * (n - 1)) / 2)
      if (n % 2) for (const id of ids) expect(byes.get(id)).toBe(1)
    }
  })

  it('swiss pairs by score without repeats and spreads byes', () => {
    const ids = [...Array(7)].map((_, i) => `p${i}`)
    const played = new Set<string>()
    const byes = new Set<string>()
    const points = new Map(ids.map(id => [id, 0]))
    for (let r = 0; r < 4; r++) {
      const standings: Standing[] = ids.map(id => ({ id, points: points.get(id)!, bye: byes.has(id) }))
      const pairs = swissRound(standings, played)
      const used = new Set<string>()
      for (const [a, b] of pairs) {
        expect(used.has(a)).toBe(false)
        used.add(a)
        if (b === null) { expect(byes.has(a)).toBe(false); byes.add(a); points.set(a, points.get(a)! + 3); continue }
        used.add(b)
        expect(played.has(key(a, b))).toBe(false)
        played.add(key(a, b))
        points.set(a < b ? a : b, points.get(a < b ? a : b)! + 3)
      }
      expect(used.size).toBe(7)
    }
  })

  it('elo is zero-sum and favours the upset', () => {
    const [a, b] = elo(1000, 1000, 1)
    expect(a + b).toBe(2000)
    expect(a).toBe(1016)
    const [low] = elo(900, 1100, 1)
    expect(low - 900).toBeGreaterThan(16)
  })
})
