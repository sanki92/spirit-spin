import { describe, expect, it } from 'vitest'
import { BLADES, DISCS, TIPS, STARTER_BUILDS, assembleTop, type BeastId } from './parts'

describe('parts', () => {
  it('each starter is its intended type', () => {
    const want: Record<BeastId, string> = { voltfang: 'attack', aegiron: 'defense', nagara: 'stamina', agnyx: 'balance', zephyra: 'stamina', umbrax: 'balance' }
    for (const [beast, type] of Object.entries(want)) {
      expect(assembleTop(STARTER_BUILDS[beast as BeastId]).type).toBe(type)
    }
  })
  it('all combinations give stats within 1..10 and positive mass', () => {
    for (const b of Object.keys(BLADES)) for (const d of Object.keys(DISCS)) for (const t of Object.keys(TIPS)) {
      const s = assembleTop({ bladeId: b, discId: d, tipId: t, beastId: 'voltfang' })
      for (const v of Object.values(s.stats)) { expect(v).toBeGreaterThanOrEqual(1); expect(v).toBeLessThanOrEqual(10) }
      expect(s.mass).toBeGreaterThan(0)
    }
  })
  it('unknown part id throws', () => {
    expect(() => assembleTop({ bladeId: 'nope', discId: 'standard', tipId: 'flat', beastId: 'nagara' })).toThrow(/blade/)
  })
  it('rarity is a sidegrade: blade stat budget equal within +-1', () => {
    const sums = Object.values(BLADES).map(b => b.attack + b.defense + b.shatterRes)
    expect(Math.max(...sums) - Math.min(...sums)).toBeLessThanOrEqual(1)
  })
  it('beast travels with the build, not the parts', () => {
    expect(assembleTop({ ...STARTER_BUILDS.voltfang, beastId: 'agnyx' }).beastId).toBe('agnyx')
  })
})
