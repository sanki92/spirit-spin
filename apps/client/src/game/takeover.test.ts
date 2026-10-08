import { describe, expect, it } from 'vitest'
import { spiritReady, type BattlePhase } from '../state/hud'
import { spiritTransitions } from './transitions'

const top = (spiritTicks: number, summonTicks: number) => ({ spiritTicks, summonTicks })

describe('spirit transitions for online and spectator views', () => {
  it('fires spirit once at summon start and takeover once when the summon ends', () => {
    const seen = { spirit: [false, false] as [boolean, boolean], summon: [false, false] as [boolean, boolean] }
    expect(spiritTransitions([top(150, 60), top(0, 0)], 10, seen).map(e => e.k)).toEqual(['spirit'])
    expect(spiritTransitions([top(150, 30), top(0, 0)], 40, seen)).toEqual([])
    expect(spiritTransitions([top(149, 0), top(0, 0)], 71, seen).map(e => e.k)).toEqual(['takeover'])
    expect(spiritTransitions([top(0, 0), top(0, 0)], 220, seen).map(e => e.k)).toEqual(['spiritEnd'])
  })
  it('a rollback that jumps straight into the takeover still fires spirit before takeover', () => {
    const seen = { spirit: [false, false] as [boolean, boolean], summon: [false, false] as [boolean, boolean] }
    expect(spiritTransitions([top(0, 0), top(120, 0)], 100, seen).map(e => e.k)).toEqual(['spirit', 'takeover'])
  })
})

describe('spirit button readiness', () => {
  const s = (gauge: number, phase: BattlePhase, rival: boolean) => ({ gauge: [gauge, 0] as [number, number], phase, spiritActive: [false, rival] as [boolean, boolean] })
  it('is disabled while the rival beast is out', () => {
    expect(spiritReady(s(1, 'battle', false))).toBe(true)
    expect(spiritReady(s(1, 'battle', true))).toBe(false)
    expect(spiritReady(s(0.5, 'battle', false))).toBe(false)
    expect(spiritReady(s(1, 'grip', false))).toBe(false)
  })
})
