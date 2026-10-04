import { describe, expect, it } from 'vitest'
import { PLAYOUT, playoutSteps } from './playout'

describe('playout', () => {
  it('plays one frame per tick, two when the buffer runs high, none when empty', () => {
    expect(playoutSteps(0)).toBe(0)
    expect(playoutSteps(1)).toBe(1)
    expect(playoutSteps(PLAYOUT.high)).toBe(1)
    expect(playoutSteps(PLAYOUT.high + 1)).toBe(2)
    expect(playoutSteps(PLAYOUT.high * 10)).toBe(4)
  })
})
