import { describe, expect, it } from 'vitest'
import { cardSide, unionBox } from './spot'

const screen = { w: 400, h: 800 }

describe('guard lesson spotlight', () => {
  it('covers the bar and the top together, padded', () => {
    const bar = { left: 178, top: 380, width: 44, height: 6 }
    const top = { left: 170, top: 392, width: 60, height: 40 }
    const u = unionBox(bar, top, 8, screen)
    expect(u.left).toBeLessThanOrEqual(170 - 8)
    expect(u.top).toBeLessThanOrEqual(380 - 8)
    expect(u.left + u.width).toBeGreaterThanOrEqual(230 + 8)
    expect(u.top + u.height).toBeGreaterThanOrEqual(432 + 8)
  })

  it('is clamped to the screen when the top sits at the edge', () => {
    const u = unionBox({ left: -10, top: 4, width: 44, height: 6 }, { left: -20, top: 12, width: 60, height: 40 }, 8, screen)
    expect(u.left).toBe(0)
    expect(u.top).toBe(0)
    expect(u.left + u.width).toBeLessThanOrEqual(400)
  })

  it('places the card on the far side of the spotlight', () => {
    expect(cardSide({ left: 150, top: 120, width: 100, height: 80 }, 800)).toBe('below')
    expect(cardSide({ left: 150, top: 560, width: 100, height: 80 }, 800)).toBe('above')
  })
})

import { cardPlacement } from './spot'

describe('review fixes: the lesson card never covers Skip tutorial', () => {
  it('pins the card under the skip chip when there is no room above the spotlight', () => {
    expect(cardPlacement({ left: 0, top: 130, width: 500, height: 592 }, 722, 104)).toEqual({ top: 104 })
    expect(cardPlacement({ left: 150, top: 560, width: 100, height: 80 }, 722, 104)).toEqual({ bottom: 722 - 560 + 22 })
    expect(cardPlacement({ left: 150, top: 120, width: 100, height: 80 }, 722, 104)).toEqual({ top: 222 })
  })
})
