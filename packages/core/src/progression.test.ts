import { describe, expect, it } from 'vitest'
import { dailyQuests, applyQuestProgress, QUEST_POOL, type Quest } from './quests'
import { levelForXp, matchRewards } from './progression'
import { PART_PRICE, shopRotation } from './shop'
import { BOSSES, towerFloor, TOWER_FLOORS } from './tower'
import { assembleTop } from './parts'

const summary = (o: Partial<Parameters<typeof matchRewards>[0]> = {}) => ({ won: true, perfectRips: 0, spiritCalls: 0, finishes: [], comeback: false, ...o })

describe('progression', () => {
  it('wins pay more than losses and perfect rips add a bonus', () => {
    expect(matchRewards(summary()).coins).toBeGreaterThan(matchRewards(summary({ won: false })).coins)
    expect(matchRewards(summary({ perfectRips: 3 })).coins).toBeGreaterThan(matchRewards(summary()).coins)
  })
  it('level grows monotonically with xp', () => {
    let last = 0
    for (let xp = 0; xp < 50000; xp += 137) { const l = levelForXp(xp); expect(l).toBeGreaterThanOrEqual(last); last = l }
    expect(levelForXp(0)).toBe(1)
  })
})

describe('tower', () => {
  it('has 50 valid floors with bosses every 10 and rising difficulty', () => {
    expect(TOWER_FLOORS).toBe(50)
    let lastSkill = -1
    for (let n = 1; n <= 50; n++) {
      const f = towerFloor(n)
      expect(() => assembleTop(f.opponent)).not.toThrow()
      if (f.boss) expect(f.brain.skill).toBeGreaterThan(towerFloor(n - 1).brain.skill)
      else { expect(f.brain.skill).toBeGreaterThanOrEqual(lastSkill); lastSkill = f.brain.skill }
      expect(f.boss !== null).toBe(n % 10 === 0)
      expect(f.reward.coins).toBeGreaterThan(0)
    }
    expect(towerFloor(10).boss).toBe('kaze')
    expect(towerFloor(50).boss).toBe('ren')
    expect(Object.keys(BOSSES)).toHaveLength(5)
  })
  it('rejects floors out of range', () => {
    expect(() => towerFloor(0)).toThrow()
    expect(() => towerFloor(51)).toThrow()
  })
})

describe('quests', () => {
  it('are deterministic per day, distinct, and differ across days', () => {
    const a = dailyQuests('2026-10-03'), b = dailyQuests('2026-10-03'), c = dailyQuests('2026-10-04')
    expect(a).toEqual(b)
    expect(new Set(a.map(q => q.id)).size).toBe(3)
    expect(a.map(q => q.id)).not.toEqual(c.map(q => q.id))
    for (const q of a) expect(QUEST_POOL.some(p => p.id === q.id)).toBe(true)
  })
  it('progress counts and completes, never past target', () => {
    const qs: Quest[] = dailyQuests('2026-10-03').map(q => ({ ...q, id: 'play3', target: 3, progress: 0 }))
    const next = applyQuestProgress(qs, summary({ won: false }))
    expect(next[0]!.progress).toBe(1)
    let s = qs
    for (let i = 0; i < 6; i++) s = applyQuestProgress(s, summary())
    expect(s[0]!.progress).toBe(3)
  })
})

describe('shop', () => {
  it('rotates deterministically with rarity pricing and never duplicates', () => {
    const a = shopRotation('2026-10-03')
    expect(a).toEqual(shopRotation('2026-10-03'))
    for (const it of shopRotation('2026-10-03', 30, 5)) expect(['fury', 'gale', 'tempest', 'titan'].includes(it.partId)).toBe(false)
    expect(new Set(a.map(i => i.id)).size).toBe(a.length)
    for (const i of a) expect(i.price).toBe(PART_PRICE[i.rarity])
  })

  it('never sells rookie starter blades or tips', () => {
    const rookie = ['blade:spark', 'blade:pebble', 'blade:ripple', 'blade:ember', 'tip:rookie-flat', 'tip:rookie-ball', 'tip:rookie-needle', 'tip:rookie-semi']
    for (let d = 1; d <= 28; d++) for (const it of shopRotation(`2026-10-${String(d).padStart(2, '0')}`, 40)) expect(rookie).not.toContain(it.id)
  })
})
