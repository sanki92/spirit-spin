import { describe, expect, it } from 'vitest'
import { PROFILES } from './netsim'
import { runMatch } from './soak'
import { ROLL } from './session'

const N = Number(process.env.SOAK ?? 8)
const per = Math.max(1, Math.round(N / 4))
const seeds = (base: number) => Array.from({ length: per }, (_, i) => base + i)

describe(`soak (${per} matches per profile)`, () => {
  it('lan: perfect play, no replaced own inputs, no stalls', () => {
    for (const seed of seeds(1000)) {
      const r = runMatch({ seed, profile: PROFILES.lan })
      expect(r, `seed ${seed}`).toMatchObject({ finished: true, synced: true, desyncs: 0, ownReplaced: 0, stalls: 0 })
    }
  })
  it('criteria (150 ms RTT, 30 ms jitter, 5% loss): own top never corrected, never stalls, never desyncs', () => {
    for (const seed of seeds(2000)) {
      const r = runMatch({ seed, profile: PROFILES.criteria })
      expect(r, `seed ${seed}`).toMatchObject({ finished: true, synced: true, desyncs: 0, ownReplaced: 0, stalls: 0 })
    }
  })
  it('300 ms spikes: play continues and stays in sync', () => {
    for (const seed of seeds(3000)) {
      const r = runMatch({ seed, profile: PROFILES.spikes })
      expect(r, `seed ${seed}`).toMatchObject({ finished: true, synced: true, desyncs: 0 })
      expect(r.maxDepth).toBeLessThanOrEqual(ROLL.maxPredict)
    }
  })
  it('phone hotspot at 30 fps vs 60 fps: in sync', () => {
    for (const seed of seeds(4000)) {
      const r = runMatch({ seed, profile: PROFILES.hotspot, fps: [30, 60] })
      expect(r, `seed ${seed}`).toMatchObject({ finished: true, synced: true, desyncs: 0 })
    }
  })
  it('uneven players (85 ms vs 320 ms one-way, ordered): never stalls, stays in sync', () => {
    const near = { ...PROFILES.tcp, latency: 85, loss: 0 }, far = { ...PROFILES.tcp, latency: 320, loss: 0 }
    for (const seed of seeds(6000)) {
      const r = runMatch({ seed, profile: near, profiles: [near, far] })
      expect(r, `seed ${seed}`).toMatchObject({ finished: true, synced: true, desyncs: 0, stalls: 0, ownReplaced: 0 })
    }
  })
  it('websocket fallback (ordered, loss becomes delay): in sync', () => {
    const r = runMatch({ seed: 5000, profile: PROFILES.tcp })
    expect(r).toMatchObject({ finished: true, synced: true, desyncs: 0 })
  })
}, 3600000)
