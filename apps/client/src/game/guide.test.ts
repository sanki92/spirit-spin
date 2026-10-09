import { describe, expect, it } from 'vitest'
import { thumbPose } from './guide'

describe('guide thumb pose', () => {
  it('loops for swipe and steer demos', () => {
    expect(thumbPose('swipe', null)).toBe('loop')
    expect(thumbPose('steer', '2')).toBe('loop')
  })

  it('timing hovers on 3-2-1, flicks exactly on LAUNCH, hides otherwise', () => {
    expect(thumbPose('timing', '3')).toBe('hover')
    expect(thumbPose('timing', '1')).toBe('hover')
    expect(thumbPose('timing', 'LAUNCH')).toBe('flick')
    expect(thumbPose('timing', null)).toBe('hidden')
  })
})

import { guideLive } from './guide'

describe('review fixes: steer hint never outlives the stick', () => {
  it('a steer guide shows only while the stick is live; other guides are unaffected', () => {
    expect(guideLive({ mode: 'steer', dir: '↑' }, 'battle')).toBe(true)
    expect(guideLive({ mode: 'steer', dir: '↑' }, 'launch')).toBe(true)
    expect(guideLive({ mode: 'steer', dir: '↑' }, 'roundEnd')).toBe(false)
    expect(guideLive({ mode: 'timing' }, 'countdown')).toBe(true)
    expect(guideLive(null, 'battle')).toBe(false)
  })
})
