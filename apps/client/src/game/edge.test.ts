import { describe, expect, it } from 'vitest'
import { edgeFlags } from '../state/hud'
import { edgeFocus, spectatorSees } from './transitions'

const top = (edgeTicks: number, out = false) => ({ edgeTicks, out })

describe('edge cue', () => {
  it('keeps the same flags object while nothing changes', () => {
    const prev: [boolean, boolean] = [false, false]
    expect(edgeFlags([top(0), top(0)], prev)).toBe(prev)
    const on: [boolean, boolean] = [true, false]
    expect(edgeFlags([top(5), top(0)], on)).toBe(on)
  })

  it('flips per side as tops start and stop teetering', () => {
    expect(edgeFlags([top(3), top(0)], [false, false])).toEqual([true, false])
    expect(edgeFlags([top(0), top(9)], [true, false])).toEqual([false, true])
    expect(edgeFlags([top(1), top(2)], [false, true])).toEqual([true, true])
  })

  it('clears when a rollback brings back a state with no teeter', () => {
    expect(edgeFlags([top(0), top(0)], [true, true])).toEqual([false, false])
  })

  it('a top that is already out is not on the edge', () => {
    expect(edgeFlags([top(4, true), top(0)], [false, false])).toEqual([false, false])
  })

  it('the camera leans to the teetering top unless a zoom owns it', () => {
    expect(edgeFocus([top(0), top(0)], false)).toBeNull()
    expect(edgeFocus([top(6), top(0)], false)).toBe(0)
    expect(edgeFocus([top(0), top(6)], false)).toBe(1)
    expect(edgeFocus([top(6), top(0)], true)).toBeNull()
    expect(edgeFocus([top(6, true), top(0)], false)).toBeNull()
  })

  it('with both teetering it follows the one closer to falling', () => {
    expect(edgeFocus([top(20), top(4)], false)).toBe(1)
    expect(edgeFocus([top(3), top(4)], false)).toBe(0)
  })

  it('spectators hear edge and save moments', () => {
    expect(spectatorSees({ k: 'edge', tick: 1, side: 0 })).toBe(true)
    expect(spectatorSees({ k: 'edgeSave', tick: 1, side: 1 })).toBe(true)
  })
})
