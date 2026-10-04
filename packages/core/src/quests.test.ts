import { describe, expect, it } from 'vitest'
import { dailyQuests } from './quests'


describe('daily quest rotation', () => {
  it('a new day never repeats yesterday quests', () => {
    let prev = dailyQuests('2026-01-31').map(q => q.id)
    for (let d = 1; d <= 60; d++) {
      const day = new Date(Date.UTC(2026, 1, d)).toISOString().slice(0, 10)
      const ids = dailyQuests(day).map(q => q.id)
      expect(new Set(ids).size, day).toBe(3)
      expect(ids.filter(id => prev.includes(id)), day).toEqual([])
      prev = ids
    }
  })
})
