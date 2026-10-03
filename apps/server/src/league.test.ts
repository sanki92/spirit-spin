import {
  applyRound, assembleTop, botInput, createBattle, deckTop, encodeInputs, ghostRip, ghostSeeds, judgeRip, newMatch, quantize, stepBattle,
  type BattleEvent, type BotBrain, type RipView, type TickInput, type TopBuild,
} from '@spirit/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp, type App } from './app'
import { cleanDeck } from './league'

let app: App
beforeAll(async () => {
  app = await buildApp({ databaseUrl: 'memory://', jwtSecret: 'test-secret-test-secret-test-secret-32', corsOrigins: ['*'], logLevel: 'silent', openaiKey: null }, { guestPerMinute: 1000 })
})
afterAll(async () => { await app.close() })

const DECK: TopBuild[] = [
  { bladeId: 'fang', discId: 'standard', tipId: 'flat', beastId: 'voltfang' },
  { bladeId: 'bastion', discId: 'heavy', tipId: 'ball', beastId: 'aegiron' },
  { bladeId: 'crescent', discId: 'rim', tipId: 'needle', beastId: 'nagara' },
]
const SWIPE = { points: Array.from({ length: 11 }, (_, i) => ({ t: 10 + i * 16, x: 200 + (i % 2), y: 100 + i * 50 })), h: 800 }
type Start = { matchId: string; seed: number; opponent: { name: string; rating: number; deck: TopBuild[]; rips: RipView[]; brain: BotBrain } }

const guest = async () => (await app.inject({ method: 'POST', url: '/v1/auth/guest' })).json() as { token: string; playerId: string }
const h = (t: string) => ({ authorization: `Bearer ${t}` })
const start = async (token: string, deck = DECK) => app.inject({ method: 'POST', url: '/v1/ranked/start', headers: h(token), payload: { deck, pool: 'swipe' } })

function play(s: Start, steer: (r: number, t: number) => TickInput) {
  const seeds = ghostSeeds(s.seed)
  const mine = DECK.map(assembleTop), theirs = s.opponent.deck.map(assembleTop)
  let m = newMatch()
  const rounds: { swipe: typeof SWIPE; pull100: number; inputs: number[] }[] = []
  const ev: BattleEvent[] = []
  for (let r = 1; m.winner === null; r++) {
    const rip = judgeRip({ swipe: SWIPE, pull100: 7 }).rip
    const b = createBattle([deckTop(mine, r), deckTop(theirs, r)], [{ rip, hesitate: false }, { rip: ghostRip(s.opponent.rips, r), hesitate: false }], seeds.battle(r))
    const inputs: TickInput[] = []
    while (!b.outcome) {
      const q = quantize(steer(r, b.tick))
      inputs.push(q)
      stepBattle(b, [q, botInput(b, 1, s.opponent.brain, seeds.bot)], ev)
      ev.length = 0
    }
    m = applyRound(m, b.outcome)
    rounds.push({ swipe: SWIPE, pull100: 7, inputs: encodeInputs(inputs) })
  }
  return { match: m, rounds }
}
const steer = (r: number, t: number): TickInput => ({ tiltX: Math.sin(t / 19 + r) * 0.8, tiltY: Math.cos(t / 29) * 0.6, spirit: t === 150 })

describe('ranked ghosts', () => {
  it('an honest ghost match is verified, scored and rated; the seed cannot be reused', async () => {
    const g = await guest()
    const res = await start(g.token)
    expect(res.statusCode).toBe(200)
    const s = res.json() as Start
    expect(s.opponent.deck).toHaveLength(3)
    const played = play(s, steer)
    const sub = await app.inject({ method: 'POST', url: `/v1/matches/${s.matchId}/submit`, headers: h(g.token), payload: { rounds: played.rounds } })
    expect(sub.statusCode).toBe(200)
    const body = sub.json() as { winner: 0 | 1; scores: [number, number]; rating: number }
    expect(body.winner).toBe(played.match.winner)
    expect(body.scores).toEqual(played.match.scores)
    expect(body.rating).not.toBe(1000)
    const again = await app.inject({ method: 'POST', url: `/v1/matches/${s.matchId}/submit`, headers: h(g.token), payload: { rounds: played.rounds } })
    expect(again.statusCode).toBe(409)
    const me = (await app.inject({ method: 'GET', url: '/v1/ranked', headers: h(g.token) })).json() as { ratingSwipe: number; played: number }
    expect(me).toMatchObject({ ratingSwipe: body.rating, played: 1 })
  })

  it('tampered inputs are rejected and the provisional loss stands', async () => {
    const g = await guest()
    const s = (await start(g.token)).json() as Start
    const provisional = ((await app.inject({ method: 'GET', url: '/v1/ranked', headers: h(g.token) })).json() as { ratingSwipe: number }).ratingSwipe
    const played = play(s, steer)
    const forged = played.rounds.map(r => ({ ...r, inputs: [100, 100, 0, 5] }))
    const sub = await app.inject({ method: 'POST', url: `/v1/matches/${s.matchId}/submit`, headers: h(g.token), payload: { rounds: forged } })
    expect(sub.statusCode).toBe(409)
    expect(((await app.inject({ method: 'GET', url: '/v1/ranked', headers: h(g.token) })).json() as { ratingSwipe: number }).ratingSwipe).toBe(provisional)
  })

  it('another player cannot submit my match; invalid decks are refused', async () => {
    const a = await guest(), b = await guest()
    const s = (await start(a.token)).json() as Start
    const played = play(s, steer)
    expect((await app.inject({ method: 'POST', url: `/v1/matches/${s.matchId}/submit`, headers: h(b.token), payload: { rounds: played.rounds } })).statusCode).toBe(404)
    expect((await start(a.token, [DECK[0]!, DECK[0]!, DECK[1]!])).statusCode).toBe(400)
    expect((await start(a.token, [DECK[0]!, DECK[1]!, { ...DECK[2]!, bladeId: 'nope' }])).statusCode).toBe(400)
  })

  it('opponents come from real players near your rating once they have a deck', async () => {
    const a = await guest(), b = await guest()
    await app.inject({ method: 'PUT', url: '/v1/save', headers: h(b.token), payload: { baseVersion: 0, save: { coins: 1, xp: 0, tower: 0, name: 'Rival' } } })
    await start(b.token)
    let found = false
    for (let i = 0; i < 12 && !found; i++) found = ((await start(a.token)).json() as Start).opponent.name !== 'Spirit Echo'
    expect(found).toBe(true)
  })

  it('absurd input submissions are rejected fast', async () => {
    const g = await guest()
    const s = (await start(g.token)).json() as Start
    const t0 = Date.now()
    const huge = Array.from({ length: 24_000 }, (_, i) => (i % 4 === 3 ? 100_000 : 0))
    const res = await app.inject({ method: 'POST', url: `/v1/matches/${s.matchId}/submit`, headers: h(g.token), payload: { rounds: [{ swipe: SWIPE, pull100: 7, inputs: huge }] } })
    expect([400, 409]).toContain(res.statusCode)
    expect(Date.now() - t0).toBeLessThan(3000)
  })

  it('an abandoned ranked match counts as a loss; a verified win refunds it', async () => {
    const g = await guest()
    await start(g.token)
    const afterIssue = ((await app.inject({ method: 'GET', url: '/v1/ranked', headers: h(g.token) })).json() as { ratingSwipe: number }).ratingSwipe
    expect(afterIssue).toBeLessThan(1000)
    const s = (await start(g.token)).json() as Start
    const played = play(s, steer)
    const sub = (await app.inject({ method: 'POST', url: `/v1/matches/${s.matchId}/submit`, headers: h(g.token), payload: { rounds: played.rounds } })).json() as { rating: number; winner: number }
    const me = (await app.inject({ method: 'GET', url: '/v1/ranked', headers: h(g.token) })).json() as { ratingSwipe: number; played: number }
    expect(me.played).toBe(2)
    expect(me.ratingSwipe).toBe(sub.rating)
    if (sub.winner === 0) expect(sub.rating).toBeGreaterThan(afterIssue)
  })
})

describe('ghost decks', () => {
  it('strip story-only kit and part levels so tournament ghosts use base strength', () => {
    const buffed = [{ ...DECK[0]!, kit: { trait: true, ultimate: true }, levels: { blade: 5, disc: 5, tip: 5 } }]
    expect(cleanDeck(buffed)).toEqual([DECK[0]])
    expect(cleanDeck([{ bladeId: 'nope', discId: 'standard', tipId: 'flat', beastId: 'voltfang' }])).toBeNull()
    expect(cleanDeck([])).toBeNull()
    expect(cleanDeck('x')).toBeNull()
  })
})
