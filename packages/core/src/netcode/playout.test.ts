import { describe, expect, it } from 'vitest'
import { holdEnd, PLAYOUT, playoutSteps } from './playout'
import { Replayer, startTimeline } from './replay'
import { fresh } from './testkit'
import { IDLE_INPUT, type Frame } from './wire'

describe('playout', () => {
  it('plays one frame per tick, two when the buffer runs high, none when empty', () => {
    expect(playoutSteps(0)).toBe(0)
    expect(playoutSteps(1)).toBe(1)
    expect(playoutSteps(PLAYOUT.high)).toBe(1)
    expect(playoutSteps(PLAYOUT.high + 1)).toBe(2)
    expect(playoutSteps(PLAYOUT.high * 10)).toBe(4)
  })

  it('the TV holds a round end until playout reaches the outcome or runs dry', () => {
    expect(holdEnd(null)).toBe(false)
    const rp = new Replayer(startTimeline(fresh()))
    expect(holdEnd(rp)).toBe(false)
    rp.push(1, Array.from({ length: 8 }, () => [IDLE_INPUT, IDLE_INPUT] as Frame))
    expect(holdEnd(rp)).toBe(true)
    rp.tl.state.outcome = { winner: 0, finish: 'spin', points: 1 }
    expect(holdEnd(rp)).toBe(false)
  })
})
