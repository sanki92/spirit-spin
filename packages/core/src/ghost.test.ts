import { describe, expect, it } from 'vitest'
import { createBattle, ROUND_TICKS, stepBattle, type BattleEvent, type TickInput } from './battle'
import { botInput } from './bot'
import { decodeInputs, deckTop, deckValid, encodeInputs, inputTicks, simulateGhosts, ghostBrain, ghostRip, ghostSeeds, quantize, replayMatch, type GhostRound } from './ghost'
import { applyRound, newMatch } from './match'
import { assembleTop, STARTER_BUILDS } from './parts'
import { composeRip, type RipResult } from './rip'

const player = assembleTop(STARTER_BUILDS.voltfang)
const ghost = assembleTop(STARTER_BUILDS.aegiron)
const ghostRips = [composeRip(0.9, 0.85, 0.8, 0, 0), composeRip(0.6, 0.7, 0.7, 30, 0)].map(r => ({ ...r, reason: null }))
const brain = ghostBrain({ rips: ghostRips, aggression: 0.6 })
const steer = (round: number, t: number): TickInput => ({ tiltX: Math.sin(t / 17 + round) * 0.9, tiltY: Math.cos(t / 23) * 0.7, spirit: t === 200 })

function playLikeClient(seed: number) {
  const seeds = ghostSeeds(seed)
  let m = newMatch()
  const rounds: GhostRound[] = []
  const ev: BattleEvent[] = []
  for (let r = 1; m.winner === null && r <= 20; r++) {
    const rip: RipResult = composeRip(0.8, 0.8, 0.75, r % 2 ? 0 : -30, 0)
    const b = createBattle([player, ghost], [{ rip, hesitate: false }, { rip: ghostRip(ghostRips, r), hesitate: false }], seeds.battle(r))
    const inputs: TickInput[] = []
    while (!b.outcome) {
      const q = quantize(steer(r, b.tick))
      inputs.push(q)
      stepBattle(b, [q, botInput(b, 1, brain, seeds.bot)], ev)
      ev.length = 0
    }
    m = applyRound(m, b.outcome)
    rounds.push({ rip, inputs })
  }
  return { match: m, rounds }
}

describe('ghost', () => {
  it('input encoding round-trips quantized inputs and compresses runs', () => {
    const ticks = [...Array(300)].map((_, t) => quantize({ tiltX: t < 150 ? 0.5 : -0.33, tiltY: 0, spirit: t === 77 }))
    const enc = encodeInputs(ticks)
    expect(decodeInputs(enc)).toEqual(ticks)
    expect(enc.length).toBeLessThan(40)
  })

  it('the server replay reproduces a client-played ghost match exactly', () => {
    const seed = 987654
    const played = playLikeClient(seed)
    const r = replayMatch({ player, ghost, brain, ghostRips, seed, rounds: played.rounds })
    expect(r.complete).toBe(true)
    expect(r.consistent).toBe(true)
    expect(r.match).toEqual(played.match)
  })

  it('tampered inputs do not replay consistently', () => {
    const played = playLikeClient(4242)
    const tampered = played.rounds.map(rd => ({ ...rd, inputs: rd.inputs.map(i => ({ ...i, tiltX: 1, tiltY: 1 })) }))
    expect(replayMatch({ player, ghost, brain, ghostRips, seed: 4242, rounds: played.rounds }).consistent).toBe(true)
    expect(replayMatch({ player, ghost, brain, ghostRips, seed: 4242, rounds: tampered }).consistent).toBe(false)
  })

  it('an unfinished submission is reported incomplete', () => {
    const played = playLikeClient(77)
    expect(replayMatch({ player, ghost, brain, ghostRips, seed: 77, rounds: played.rounds.slice(0, 1) }).complete).toBe(false)
  })

  it('decks cycle by round and must not repeat parts', () => {
    expect([1, 2, 3, 4].map(r => deckTop(['a', 'b', 'c'], r))).toEqual(['a', 'b', 'c', 'a'])
    expect(deckTop('solo', 5)).toBe('solo')
    const d = (b: string, dd: string, t: string) => ({ bladeId: b, discId: dd, tipId: t })
    expect(deckValid([d('fang', 'standard', 'flat'), d('bastion', 'heavy', 'ball'), d('crescent', 'rim', 'needle')])).toBe(true)
    expect(deckValid([d('fang', 'standard', 'flat'), d('fang', 'heavy', 'ball'), d('crescent', 'rim', 'needle')])).toBe(false)
    expect(deckValid([d('fang', 'standard', 'flat')])).toBe(false)
  })

  it('ghost skill follows recorded rips; an empty history gets a fair default', () => {
    const strong = ghostBrain({ rips: [composeRip(1, 1, 0.8, 0, 0)].map(r => ({ ...r, reason: null })), aggression: 0.9 })
    const weak = ghostBrain({ rips: [composeRip(0.2, 0.3, 0.4, 0, 0)].map(r => ({ ...r, reason: null })), aggression: 0.1 })
    expect(strong.skill).toBeGreaterThan(weak.skill)
    expect(strong.aggression).toBeGreaterThan(weak.aggression)
    const def = ghostBrain({ rips: [], aggression: Number.NaN })
    expect(def.skill).toBeGreaterThan(0.3)
    expect(def.skill).toBeLessThan(0.7)
    expect(ghostRip([], 3).rpm).toBeGreaterThan(8000)
  })

  it('ghost vs ghost is deterministic per seed and always finishes', () => {
    const A = { deck: [player], rips: ghostRips, brain }
    const B = { deck: [ghost], rips: [], brain: ghostBrain({ rips: [], aggression: 0.4 }) }
    const m1 = simulateGhosts(A, B, 99), m2 = simulateGhosts(A, B, 99)
    expect(m1).toEqual(m2)
    expect(m1.winner).not.toBeNull()
  })

  it('decoding is capped at one round of ticks no matter what counts are claimed', () => {
    const t0 = performance.now()
    const huge = decodeInputs(Array.from({ length: 24_000 }, (_, i) => (i % 4 === 3 ? 100_000 : 0)))
    expect(huge.length).toBeLessThanOrEqual(ROUND_TICKS + 10)
    expect(performance.now() - t0).toBeLessThan(200)
    expect(inputTicks([0, 0, 0, 5, 1, 1, 0, 7])).toBe(12)
  })
})
