import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp, type App } from './app'
import { playGhost, type Issued } from './test-utils'

let app: App
beforeAll(async () => {
  app = await buildApp({ databaseUrl: 'memory://', jwtSecret: 'test-secret-test-secret-test-secret-32', corsOrigins: ['*'], logLevel: 'silent', openaiKey: null }, { guestPerMinute: 1000 })
})
afterAll(async () => { await app.close() })

const guest = async () => (await app.inject({ method: 'POST', url: '/v1/auth/guest' })).json() as { token: string; playerId: string }
const h = (t: string) => ({ authorization: `Bearer ${t}` })
type Pairing = { id: string; round: number; a: string; b: string | null; winner: string | null }
type Detail = { id: string; code: string; status: string; format: string; round: number; roundsTotal: number; entries: { playerId: string; name: string; points: number }[]; pairings: Pairing[] }
const detail = async (t: string, id: string) => (await app.inject({ method: 'GET', url: `/v1/tournaments/${id}`, headers: h(t) })).json() as Detail

async function lobby(n: number) {
  const players = []
  for (let i = 0; i < n; i++) players.push(await guest())
  const created = await app.inject({ method: 'POST', url: '/v1/tournaments', headers: h(players[0]!.token), payload: { name: 'Friday Cup' } })
  expect(created.statusCode).toBe(200)
  const t = created.json() as Detail
  for (const p of players.slice(1)) expect((await app.inject({ method: 'POST', url: '/v1/tournaments/join', headers: h(p.token), payload: { code: t.code.toLowerCase() } })).statusCode).toBe(200)
  return { players, t }
}

describe('tournaments', () => {
  it('a 4-player round robin completes through verified ghost matches', async () => {
    const { players, t } = await lobby(4)
    const tok = new Map(players.map(p => [p.playerId, p.token]))
    expect((await app.inject({ method: 'POST', url: `/v1/tournaments/${t.id}/start`, headers: h(players[1]!.token) })).statusCode).toBe(403)
    expect((await app.inject({ method: 'POST', url: `/v1/tournaments/${t.id}/start`, headers: h(players[0]!.token) })).statusCode).toBe(200)
    let d = await detail(players[0]!.token, t.id)
    expect(d).toMatchObject({ status: 'running', format: 'rr', round: 1, roundsTotal: 3 })
    for (let round = 1; round <= 3; round++) {
      d = await detail(players[0]!.token, t.id)
      expect(d.round).toBe(round)
      for (const p of d.pairings.filter(x => x.round === round && !x.winner)) {
        const token = tok.get(p.a)!
        const issued = await app.inject({ method: 'POST', url: `/v1/tournaments/${t.id}/pairings/${p.id}/play`, headers: h(token), payload: { pool: 'swipe' } })
        expect(issued.statusCode).toBe(200)
        const s = issued.json() as Issued
        const played = playGhost(s)
        expect((await app.inject({ method: 'POST', url: `/v1/matches/${s.matchId}/submit`, headers: h(token), payload: { rounds: played.rounds } })).statusCode).toBe(200)
      }
    }
    d = await detail(players[0]!.token, t.id)
    expect(d.status).toBe('done')
    expect(d.entries.reduce((a, e) => a + e.points, 0)).toBe(18)
    expect(d.entries[0]!.points).toBeGreaterThanOrEqual(d.entries[3]!.points)
  })

  it('a 7-player swiss pairs without repeats, gives byes, and the deadline sweep resolves absent players', async () => {
    const { players, t } = await lobby(7)
    await app.inject({ method: 'POST', url: `/v1/tournaments/${t.id}/start`, headers: h(players[0]!.token) })
    let d = await detail(players[0]!.token, t.id)
    expect(d).toMatchObject({ format: 'swiss', roundsTotal: 3 })
    const seen = new Set<string>()
    for (let round = 1; round <= 3; round++) {
      d = await detail(players[0]!.token, t.id)
      const pr = d.pairings.filter(p => p.round === round)
      expect(pr.filter(p => p.b === null)).toHaveLength(1)
      for (const p of pr.filter(x => x.b)) {
        const k = [p.a, p.b].sort().join()
        expect(seen.has(k)).toBe(false)
        seen.add(k)
      }
      await app.sweepTournaments(Date.now() + 25 * 3600 * 1000)
    }
    d = await detail(players[0]!.token, t.id)
    expect(d.status).toBe('done')
    expect(d.pairings.every(p => p.winner)).toBe(true)
  })

  it('validates lobby rules and webhook urls', async () => {
    const a = await guest()
    expect((await app.inject({ method: 'POST', url: '/v1/tournaments', headers: h(a.token), payload: { name: 'X', webhook: 'https://evil.example.com/api/webhooks/1/abc' } })).statusCode).toBe(400)
    expect((await app.inject({ method: 'POST', url: '/v1/tournaments', headers: h(a.token), payload: { name: 'Y', webhook: 'https://discord.com/api/webhooks/123/abc-DEF_9' } })).statusCode).toBe(200)
    const { players, t } = await lobby(3)
    expect((await app.inject({ method: 'POST', url: `/v1/tournaments/${t.id}/start`, headers: h(players[0]!.token) })).statusCode).toBe(400)
    const list = (await app.inject({ method: 'GET', url: '/v1/tournaments', headers: h(players[1]!.token) })).json() as { tournaments: { id: string }[] }
    expect(list.tournaments.map(x => x.id)).toContain(t.id)
  })
})
