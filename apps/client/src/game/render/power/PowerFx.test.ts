import { Group, Quaternion } from 'three'
import { describe, expect, it } from 'vitest'
import type { BeastId } from '@spirit/core'
import { PowerFx, type PowerFactory } from './PowerFx'
import { blankTextures, top } from './testkit'

function spy() {
  const calls: string[] = []
  const f: PowerFactory = () => ({ group: new Group(), begin: () => { calls.push('begin') }, cue: m => { calls.push(`cue:${m}`) }, update: (_dt, e) => { calls.push(`e${e}`) }, end: () => { calls.push('end') }, reset: () => { calls.push('reset') } })
  return { calls, f }
}
const q = new Quaternion()

describe('power manager', () => {
  it('starts and stops each side from top state alone, so rollbacks and late joins stay right', () => {
    const a = spy(), fx = new PowerFx(blankTextures(), 20, { voltfang: a.f })
    fx.setBeasts(['voltfang', 'aegiron'] as [BeastId, BeastId])
    const me = top(0, 0), foe = top(0.3, 0)
    me.spiritTicks = 150; me.summonTicks = 60
    fx.update(1 / 60, [me, foe], false, q)
    me.summonTicks = 0
    fx.update(1 / 60, [me, foe], false, q)
    me.spiritTicks = 149
    fx.update(1 / 60, [me, foe], false, q)
    me.spiritTicks = 0
    fx.update(1 / 60, [me, foe], false, q)
    expect(a.calls).toEqual(['e-1', 'e-1', 'begin', 'e0', 'end', 'e-1'])
  })
  it('routes beast cues to the side that made them', () => {
    const a = spy(), b = spy(), fx = new PowerFx(blankTextures(), 20, { voltfang: a.f, aegiron: b.f })
    fx.setBeasts(['voltfang', 'aegiron'])
    fx.onEvent({ k: 'beast', tick: 1, side: 1, move: 'shockwave', x: 0, y: 0 }, [top(0, 0), top(0.3, 0)])
    expect(b.calls).toEqual(['cue:shockwave']); expect(a.calls).toEqual([])
  })
  it('a beast with no power yet renders nothing and never throws', () => {
    const fx = new PowerFx(blankTextures(), 20, {})
    fx.setBeasts(['nagara', 'umbrax'])
    const me = top(0, 0); me.spiritTicks = 100
    expect(() => { fx.update(1 / 60, [me, top(0.3, 0)], false, q); fx.reset() }).not.toThrow()
  })
})
