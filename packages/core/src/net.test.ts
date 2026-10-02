import { describe, expect, it } from 'vitest'
import { createBattle, stepBattle, type BattleEvent, type BattleState } from './battle'
import { InputTrack, Predictor, type NetInput } from './net'
import { assembleTop, STARTER_BUILDS } from './parts'
import { composeRip } from './rip'

const specs = [assembleTop(STARTER_BUILDS.voltfang), assembleTop(STARTER_BUILDS.nagara)] as const
const fresh = (): BattleState => createBattle([specs[0], specs[1]], [{ rip: composeRip(0.9, 0.9, 0.8, 0, 0), hesitate: false }, { rip: composeRip(0.8, 0.8, 0.8, 30, 0), hesitate: false }], 42)
const mine = (t: number): NetInput => ({ x: Math.sin(t / 20) * 0.8, y: Math.cos(t / 33) * 0.6, seq: t > 200 ? 1 : 0 })
const foe = (t: number): NetInput => ({ x: Math.cos(t / 15) * 0.5, y: -0.4, seq: t > 260 ? 1 : 0 })

function server(ticks: number) {
  const s = fresh(), tracks = [new InputTrack(), new InputTrack()] as const
  const snaps: { tick: number; state: BattleState; inputs: [NetInput, NetInput] }[] = []
  const ev: BattleEvent[] = []
  for (let t = 1; t <= ticks && !s.outcome; t++) {
    const a = mine(t), b = foe(t)
    stepBattle(s, [tracks[0].at(a), tracks[1].at(b)], ev)
    if (t % 3 === 0 || s.outcome) snaps.push({ tick: t, state: structuredClone(s), inputs: [a, b] })
  }
  return { final: s, snaps }
}

describe('net', () => {
  it('InputTrack fires one spirit edge per seq increase, even when seqs are skipped', () => {
    const tr = new InputTrack()
    const seqs = [0, 0, 1, 1, 1, 3, 3, 2, 4]
    expect(seqs.map(seq => tr.at({ x: 0, y: 0, seq }).spirit)).toEqual([false, false, true, false, false, true, false, false, true])
  })

  it('zero-latency snapshots keep the predictor identical to the server', () => {
    const { final, snaps } = server(300)
    const p = new Predictor(fresh(), 0)
    let i = 0
    for (let t = 1; t <= final.tick; t++) {
      p.step(mine(t), [])
      if (snaps[i]?.tick === t) { const sn = snaps[i++]!; p.reconcile(sn.tick, sn.state, sn.inputs) }
    }
    expect(p.state).toEqual(final)
  })

  it('late snapshots are replayed forward to the predicted tick', () => {
    const { snaps } = server(400)
    const p = new Predictor(fresh(), 0)
    const lag = 6
    let i = 0
    for (let t = 1; t <= 400; t++) {
      p.step(mine(t), [])
      while (snaps[i] && snaps[i]!.tick <= t - lag) { const sn = snaps[i++]!; p.reconcile(sn.tick, sn.state, sn.inputs) }
      if (p.state.outcome) break
    }
    const last = snaps[i - 1]!
    const replay = new Predictor(structuredClone(last.state), 0, last.inputs)
    for (let t = last.tick + 1; t <= p.state.tick; t++) replay.step(mine(t), [])
    expect(p.state.tops[0]).toEqual(replay.state.tops[0])
  })

  it('ignores stale snapshots', () => {
    const { snaps } = server(30)
    const p = new Predictor(fresh(), 1)
    for (let t = 1; t <= 12; t++) p.step(foe(t), [])
    expect(p.reconcile(snaps[2]!.tick, snaps[2]!.state, snaps[2]!.inputs)).toBe(true)
    const before = structuredClone(p.state)
    expect(p.reconcile(snaps[1]!.tick, snaps[1]!.state, snaps[1]!.inputs)).toBe(false)
    expect(p.state).toEqual(before)
  })
})
