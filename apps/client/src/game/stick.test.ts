import { describe, expect, it } from 'vitest'
import { stickLive, type BattlePhase } from '../state/hud'

describe('the stick is there the moment the top lands', () => {
  it('shows in launch and battle, never elsewhere or for spectators', () => {
    const all: BattlePhase[] = ['idle', 'grip', 'countdown', 'coach', 'launch', 'battle', 'roundEnd', 'matchEnd', 'paused']
    expect(all.filter(p => stickLive(p, false))).toEqual(['launch', 'battle'])
    expect(all.filter(p => stickLive(p, true))).toEqual([])
  })
})
