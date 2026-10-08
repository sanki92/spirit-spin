import { describe, expect, it } from 'vitest'
import { spiritReady, spiritRefused, summonReset, useHud, type BattlePhase } from '../state/hud'
import { AWAKE_SCALE, beastShot, spectatorSees, spiritTransitions, summonEnd, summonFocus, summonStart, takeoverOn, zoomAfterEnd } from './transitions'
import { powerTextureList } from './render/power/textures'
import { blankTextures } from './render/power/testkit'

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

describe('round end and cancelled spirits', () => {
  it('no takeover counts once the round has an outcome', () => {
    const t = { spiritTicks: 100, summonTicks: 0 }
    expect(takeoverOn(t, null)).toBe(true)
    expect(takeoverOn(t, { winner: 0, finish: 'spirit' } as never)).toBe(false)
    expect(takeoverOn({ spiritTicks: 100, summonTicks: 5 }, null)).toBe(false)
  })
  it('a cancelled spirit clears only its own summon letterbox', () => {
    expect(summonEnd(0, 0)).toBeNull()
    expect(summonEnd(1, 0)).toBe(1)
    expect(summonEnd(null, 0)).toBeNull()
  })
  it('spectators see beast cues along with clash and wall', () => {
    const at = { tick: 1, side: 0 as const }
    expect(spectatorSees({ k: 'beast', ...at, move: 'strike', x: 0, y: 0 })).toBe(true)
    expect(spectatorSees({ k: 'wall', ...at } as never)).toBe(true)
    expect(spectatorSees({ k: 'clash' } as never)).toBe(true)
    expect(spectatorSees({ k: 'spirit', ...at })).toBe(false)
  })
  it('lists every power texture for pre-upload', () => {
    const tex = blankTextures()
    expect(powerTextureList(tex)).toHaveLength(Object.keys(tex).length)
  })
})

describe('double call and refused press', () => {
  it('tracks one or both summons and clears each side on its own', () => {
    expect(summonStart(null, 0)).toBe(0)
    expect(summonStart(0, 1)).toBe('both')
    expect(summonStart(1, 0)).toBe('both')
    expect(summonStart('both', 1)).toBe('both')
    expect(summonEnd('both', 0)).toBe(1)
    expect(summonEnd(summonEnd('both', 0), 1)).toBeNull()
    expect(summonEnd(summonEnd('both', 1), 0)).toBeNull()
  })
  it('a rollback that cancels a summon before its takeover clears the letterbox', () => {
    const seen = { spirit: [false, false] as [boolean, boolean], summon: [false, false] as [boolean, boolean] }
    let s: 0 | 1 | 'both' | null = null
    const apply = (tops: { spiritTicks: number; summonTicks: number }[], tick: number) => {
      for (const e of spiritTransitions(tops, tick, seen)) {
        if (e.k === 'spirit') s = summonStart(s, e.side)
        if (e.k === 'takeover' || e.k === 'spiritEnd') s = summonEnd(s, e.side)
      }
    }
    apply([top(150, 60), top(150, 60)], 10)
    expect(s).toBe('both')
    apply([top(0, 0), top(149, 50)], 11)
    expect(s).toBe(1)
    apply([top(0, 0), top(100, 0)], 70)
    expect(s).toBeNull()
  })
  it('frames both tops only when both beasts are being summoned', () => {
    expect(summonFocus(true, true)).toBe('both')
    expect(summonFocus(true, false)).toBe(0)
    expect(summonFocus(false, true)).toBe(1)
    expect(summonFocus(false, false)).toBeNull()
  })
  it('a press while the rival beast is out is refused with a cue, not ignored', () => {
    const s = (gauge: number, phase: BattlePhase, rival: boolean) => ({ gauge: [gauge, 0] as [number, number], phase, spiritActive: [false, rival] as [boolean, boolean] })
    expect(spiritRefused(s(1, 'battle', true))).toBe(true)
    expect(spiritRefused(s(1, 'battle', false))).toBe(false)
    expect(spiritRefused(s(0.4, 'battle', true))).toBe(false)
    expect(spiritRefused(s(1, 'roundEnd', true))).toBe(false)
  })
})

describe('summon camera', () => {
  const tops = [{ x: 0.3, y: -0.2 }, { x: -0.1, y: 0.4 }] as const
  it('frames the whole beast above a single summoning top: raised focus, pulled back from the full close-up', () => {
    const o = { x: 0, y: 0, z: 0, amount: 0 }
    beastShot(o, tops, 0)
    expect(o.x).toBeCloseTo(0.3)
    expect(o.z).toBeLessThan(0.2)
    expect(o.z).toBeGreaterThan(0.2 - 0.3)
    expect(o.y).toBeGreaterThan(0.5)
    expect(o.y).toBeLessThan(1)
    expect(o.amount).toBeLessThan(0.75)
    expect(o.amount).toBeGreaterThan(0.45 - 1e-9)
  })
  it('pulls back and raises the focus for the 25% larger awakened beast, single and double', () => {
    for (const side of [0, 'both'] as const) {
      const a = { x: 0, y: 0, z: 0, amount: 0 }, b = { x: 0, y: 0, z: 0, amount: 0 }
      beastShot(a, tops, side)
      beastShot(b, tops, side, AWAKE_SCALE)
      expect(b.amount).toBeLessThan(a.amount)
      expect(b.amount).toBeGreaterThan(0.25)
      expect(b.y).toBeGreaterThan(a.y)
      expect(b.y).toBeLessThan(1.2)
      expect(b.x).toBe(a.x)
    }
    const o = { x: 0, y: 0, z: 0, amount: 0 }
    beastShot(o, tops, 0, 1)
    expect(o.amount).toBeCloseTo(0.5)
  })
  it('a double call frames the midpoint of both tops, wider than a single summon', () => {
    const o = { x: 0, y: 0, z: 0, amount: 0 }
    beastShot(o, tops, 'both')
    expect(o.x).toBeCloseTo(0.1)
    expect(o.y).toBeGreaterThan(0.5)
    const single = { x: 0, y: 0, z: 0, amount: 0 }
    beastShot(single, tops, 1)
    expect(o.amount).toBeLessThan(single.amount)
  })
})

describe('camera after a summon ends', () => {
  it('switches a double-call camera to the surviving side and releases only when none are left', () => {
    expect(zoomAfterEnd('both', summonEnd('both', 0))).toBe(1)
    expect(zoomAfterEnd('both', summonEnd('both', 1))).toBe(0)
    expect(zoomAfterEnd(1, summonEnd(1, 1))).toBe('release')
    expect(zoomAfterEnd(0, summonEnd(0, 1))).toBeNull()
    expect(zoomAfterEnd(null, null)).toBeNull()
  })
})

describe('new match hud reset', () => {
  it('clears a leftover summon letterbox and refused toast', () => {
    useHud.getState().set({ summon: 'both', refused: 3 })
    useHud.getState().set({ ...summonReset })
    expect(useHud.getState().summon).toBeNull()
    expect(useHud.getState().refused).toBe(0)
  })
})
