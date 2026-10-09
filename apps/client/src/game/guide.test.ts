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
