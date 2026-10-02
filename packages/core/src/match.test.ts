import { describe, expect, it } from 'vitest'
import { applyRound, newMatch, MAX_ROUNDS, HARD_ROUND_CAP } from './match'

const spin0 = { winner: 0 as const, finish: 'spin' as const, points: 1 as const }
describe('match', () => {
  it('first to 4 points wins', () => {
    let m = newMatch()
    for (let i = 0; i < 3; i++) m = applyRound(m, spin0)
    expect(m.winner).toBeNull()
    m = applyRound(m, spin0)
    expect(m.winner).toBe(0); expect(m.scores).toEqual([4, 0])
  })
  it('spirit finish + spin finish wins', () => {
    let m = applyRound(newMatch(), { winner: 1, finish: 'spirit', points: 3 })
    m = applyRound(m, { winner: 1, finish: 'spin', points: 1 })
    expect(m.winner).toBe(1)
  })
  it('draws add no points but advance the round', () => {
    const m = applyRound(newMatch(), { winner: null, finish: 'draw', points: 0 })
    expect(m.scores).toEqual([0, 0]); expect(m.round).toBe(2); expect(m.history).toHaveLength(1)
  })
  it('is pure', () => {
    const m = newMatch(); applyRound(m, spin0); expect(m.scores).toEqual([0, 0])
  })
  it('rejects rounds after the match is decided', () => {
    let m = newMatch(); for (let i = 0; i < 4; i++) m = applyRound(m, spin0)
    expect(() => applyRound(m, spin0)).toThrow()
  })
  it('roundCap: after MAX_ROUNDS the leader wins; a tie stays open for sudden death', () => {
    let m = newMatch()
    for (let i = 0; i < MAX_ROUNDS - 1; i++) m = applyRound(m, { winner: null, finish: 'draw', points: 0 })
    const lead = applyRound(m, spin0)
    expect(lead.winner).toBe(0)
    const tie = applyRound(m, { winner: null, finish: 'draw', points: 0 })
    expect(tie.winner).toBeNull(); expect(tie.suddenDeath).toBe(true)
  })
  it('never loops forever: hard cap decides endless draws', () => {
    let m = newMatch()
    for (let i = 0; i < HARD_ROUND_CAP && m.winner === null; i++) m = applyRound(m, { winner: null, finish: 'draw', points: 0 })
    expect(m.winner).not.toBeNull()
  })
})
