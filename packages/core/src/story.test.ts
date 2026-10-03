import { describe, expect, it } from 'vitest'
import { assembleTop, STARTER_BUILDS } from './parts'
import { CHAPTERS, chapterOf, kitFor, progressBuild, upgradeCost } from './story'
import { towerFloor } from './tower'

describe('story progression', () => {
  const p = { partLevels: { 'blade:fang': 3 }, traits: [] as ('voltfang' | 'aegiron')[] }
  it('part levels raise the primary stat and costs grow', () => {
    const base = assembleTop(STARTER_BUILDS.voltfang)
    const up = assembleTop(progressBuild(STARTER_BUILDS.voltfang, p, undefined))
    expect(up.stats.attack).toBeGreaterThanOrEqual(base.stats.attack)
    expect(upgradeCost(1)).toBe(20)
    expect(upgradeCost(5)).toBeNull()
  })
  it('upgrade points past the 10 cap spill into the related stat instead of being wasted', () => {
    const b = { bladeId: 'bastion', discId: 'heavy', tipId: 'ball', beastId: 'aegiron' as const }
    const base = assembleTop(b)
    const up = (blade: number, disc = 1) => assembleTop({ ...b, levels: { blade, disc, tip: 1 } }).stats
    expect(base.stats.defense).toBeLessThan(10)
    expect(up(5).defense).toBe(10)
    expect(up(5).stamina).toBeGreaterThan(base.stats.stamina)
    expect(up(5, 5).stamina).toBeGreaterThanOrEqual(up(5).stamina)
    expect(assembleTop({ bladeId: 'fury', discId: 'standard', tipId: 'flat', beastId: 'voltfang' }).stats.speed).toBe(assembleTop({ bladeId: 'fury', discId: 'standard', tipId: 'flat', beastId: 'voltfang', levels: {} }).stats.speed)
  })
  it('trait unlocks at trust 30 or by purchase, ultimate when awakened', () => {
    expect(kitFor('voltfang', p, { trust: 10, awakened: null })).toEqual({ trait: false, ultimate: false })
    expect(kitFor('voltfang', p, { trust: 30, awakened: null }).trait).toBe(true)
    expect(kitFor('aegiron', { ...p, traits: ['aegiron'] }, undefined).trait).toBe(true)
    expect(kitFor('voltfang', p, { trust: 0, awakened: 'storm' }).ultimate).toBe(true)
  })
  it('chapters cover floors 1-50 with their boss at the last floor', () => {
    for (const c of CHAPTERS) expect(towerFloor(c.floors[1]).boss).toBe(c.boss)
    expect(chapterOf(40).boss).toBe('vex')
    expect(towerFloor(40).reward.beast).toBe('zephyra')
    expect(towerFloor(50).reward.beast).toBe('umbrax')
  })
})
