import { describe, expect, it } from 'vitest'
import { limitEconomy } from './economy'

const T0 = 1_800_000_000_000

describe('save economy limits', () => {
  it('lets honest progress through untouched', () => {
    const r = limitEconomy({ coins: 1000, shards: 20, xp: 500 }, { coins: 1400, shards: 45, xp: 620 }, T0, T0 + 60_000)
    expect(r.clamped).toEqual([])
    expect(r.save).toMatchObject({ coins: 1400, shards: 45, xp: 620 })
  })

  it('allows a big burst like claiming many pass tiers at once', () => {
    expect(limitEconomy({ coins: 2000 }, { coins: 7500 }, T0, T0 + 1000).clamped).toEqual([])
  })

  it('cuts an edited balance back to what time allows', () => {
    const r = limitEconomy({ coins: 1000, shards: 0, xp: 0 }, { coins: 9_999_999, shards: 99_999, xp: 50_000_000 }, T0, T0 + 10 * 60_000)
    expect(r.clamped.sort()).toEqual(['coins', 'shards', 'xp'])
    expect(r.save).toMatchObject({ coins: 1000 + 6000 + 1200, shards: 400 + 100, xp: 3000 + 1200 })
  })

  it('uses the starting balance for a brand-new account and ignores junk values', () => {
    const r = limitEconomy({}, { coins: 1e9, shards: -5, xp: 'lots' }, T0, T0)
    expect(r.save.coins).toBe(150 + 6000)
    expect(r.clamped).toEqual(['coins'])
  })
})
