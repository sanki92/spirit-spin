import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp, type App } from './app'

let app: App
beforeAll(async () => {
  app = await buildApp({ databaseUrl: 'memory://', jwtSecret: 'test-secret-test-secret-test-secret-32', corsOrigins: ['*'], logLevel: 'silent', openaiKey: null })
})
afterAll(async () => { await app.close() })

const guest = async () => (await app.inject({ method: 'POST', url: '/v1/auth/guest' })).json() as { token: string; playerId: string; recoveryCode: string }
const auth = (token: string) => ({ authorization: `Bearer ${token}` })
const SAVE = { version: 1, coins: 150, xp: 0, tower: 0, starter: 'voltfang', beasts: {}, owned: { blades: [], discs: [], tips: [] } }

describe('server', () => {
  it('health', async () => {
    const r = await app.inject({ method: 'GET', url: '/healthz' })
    expect(r.statusCode).toBe(200)
    expect(r.json()).toMatchObject({ ok: true })
  })
  it('guest sign-in returns a token and a recovery code', async () => {
    const g = await guest()
    expect(g.token.split('.')).toHaveLength(3)
    expect(g.recoveryCode).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/)
  })
  it('rejects missing or forged tokens', async () => {
    expect((await app.inject({ method: 'GET', url: '/v1/me' })).statusCode).toBe(401)
    expect((await app.inject({ method: 'GET', url: '/v1/me', headers: auth('a.b.c') })).statusCode).toBe(401)
  })
  it('saves with optimistic concurrency and returns the latest', async () => {
    const g = await guest()
    const put1 = await app.inject({ method: 'PUT', url: '/v1/save', headers: auth(g.token), payload: { baseVersion: 0, save: SAVE } })
    expect(put1.statusCode).toBe(200)
    expect(put1.json().version).toBe(1)
    const stale = await app.inject({ method: 'PUT', url: '/v1/save', headers: auth(g.token), payload: { baseVersion: 0, save: { ...SAVE, coins: 9 } } })
    expect(stale.statusCode).toBe(409)
    expect(stale.json().save.coins).toBe(150)
    const me = await app.inject({ method: 'GET', url: '/v1/me', headers: auth(g.token) })
    expect(me.json()).toMatchObject({ playerId: g.playerId, version: 1, save: { coins: 150 } })
  })
  it('rejects absurd or oversized saves', async () => {
    const g = await guest()
    const bad = await app.inject({ method: 'PUT', url: '/v1/save', headers: auth(g.token), payload: { baseVersion: 0, save: { ...SAVE, coins: 1e12 } } })
    expect(bad.statusCode).toBe(400)
    const huge = await app.inject({ method: 'PUT', url: '/v1/save', headers: auth(g.token), payload: { baseVersion: 0, save: { ...SAVE, junk: 'x'.repeat(300_000) } } })
    expect([400, 413]).toContain(huge.statusCode)
  })
  it('recovery code restores the same player; wrong codes fail', async () => {
    const g = await guest()
    const r = await app.inject({ method: 'POST', url: '/v1/auth/recover', payload: { code: g.recoveryCode.toLowerCase() } })
    expect(r.statusCode).toBe(200)
    expect(r.json().playerId).toBe(g.playerId)
    expect((await app.inject({ method: 'POST', url: '/v1/auth/recover', payload: { code: 'AAAA-AAAA-AAAA' } })).statusCode).toBe(404)
  })
  it('rate limits auth bursts', async () => {
    let limited = false
    for (let i = 0; i < 40 && !limited; i++) if ((await app.inject({ method: 'POST', url: '/v1/auth/recover', payload: { code: 'BBBB-BBBB-BBBB' } })).statusCode === 429) limited = true
    expect(limited).toBe(true)
  })
})

describe('friends', () => {
  const me = async (token: string) => (await app.inject({ method: 'GET', url: '/v1/me', headers: auth(token) })).json() as { friendCode: string; playerId: string }
  const list = async (token: string) => (await app.inject({ method: 'GET', url: '/v1/friends', headers: auth(token) })).json() as { friends: { playerId: string; name: string; friendCode: string; seen?: number }[] }
  it('every player has a friend code; friendship forms when both add each other, idempotently', async () => {
    const a = await guest(), b = await guest()
    const ma = await me(a.token), mb = await me(b.token)
    expect(ma.friendCode).toMatch(/^[A-HJ-NP-Z2-9]{6}$/)
    expect(ma.friendCode).not.toBe(mb.friendCode)
    await app.inject({ method: 'PUT', url: '/v1/save', headers: auth(b.token), payload: { baseVersion: 0, save: { ...SAVE, name: 'Bo<b>!' } } })
    const add = await app.inject({ method: 'POST', url: '/v1/friends', headers: auth(a.token), payload: { code: mb.friendCode.toLowerCase() } })
    expect(add.statusCode).toBe(200)
    expect((await app.inject({ method: 'POST', url: '/v1/friends', headers: auth(a.token), payload: { code: mb.friendCode } })).statusCode).toBe(200)
    expect((await list(a.token)).friends).toEqual([])
    await app.inject({ method: 'POST', url: '/v1/friends', headers: auth(b.token), payload: { code: ma.friendCode } })
    expect((await list(a.token)).friends).toEqual([{ playerId: b.playerId, name: 'Bob', friendCode: mb.friendCode, beast: SAVE.starter, seen: expect.any(Number) }])
    expect((await list(a.token)).friends[0]!.seen).toBeLessThan(5000)
    expect((await list(b.token)).friends.map(f => f.playerId)).toEqual([a.playerId])
  })
  const befriend = async () => {
    const a = await guest(), b = await guest()
    const ma = await me(a.token), mb = await me(b.token)
    await app.inject({ method: 'POST', url: '/v1/friends', headers: auth(a.token), payload: { code: mb.friendCode } })
    await app.inject({ method: 'POST', url: '/v1/friends', headers: auth(b.token), payload: { code: ma.friendCode } })
    return { a, b, ma, mb }
  }
  const challenges = async (token: string) => ((await app.inject({ method: 'GET', url: '/v1/friends', headers: auth(token) })).json() as { challenges: { from: { playerId: string; name: string }; code: string }[] }).challenges
  it('a friend can challenge with a room code; it shows up for them once and clears when declined', async () => {
    const { a, b, ma } = await befriend()
    const send = await app.inject({ method: 'POST', url: '/v1/challenges', headers: auth(a.token), payload: { to: b.playerId, code: 'abcd' } })
    expect(send.statusCode).toBe(200)
    await app.inject({ method: 'POST', url: '/v1/challenges', headers: auth(a.token), payload: { to: b.playerId, code: 'WXYZ' } })
    const got = await challenges(b.token)
    expect(got).toEqual([{ from: { playerId: ma.playerId, name: expect.any(String) }, code: 'WXYZ', at: expect.any(Number) }])
    expect(await challenges(a.token)).toEqual([])
    expect((await app.inject({ method: 'POST', url: '/v1/challenges/decline', headers: auth(b.token), payload: { from: a.playerId } })).statusCode).toBe(200)
    expect(await challenges(b.token)).toEqual([])
  })
  it('only mutual friends can be challenged, with a valid code', async () => {
    const a = await guest(), b = await guest()
    expect((await app.inject({ method: 'POST', url: '/v1/challenges', headers: auth(a.token), payload: { to: b.playerId, code: 'ABCD' } })).statusCode).toBe(403)
    const f = await befriend()
    expect((await app.inject({ method: 'POST', url: '/v1/challenges', headers: auth(f.a.token), payload: { to: f.b.playerId, code: 'AB!' } })).statusCode).toBe(400)
  })
  it('declining a request or removing a friend deletes both directions', async () => {
    const { a, b } = await befriend()
    expect((await app.inject({ method: 'DELETE', url: `/v1/friends/${a.playerId}`, headers: auth(b.token) })).statusCode).toBe(200)
    expect((await list(a.token)).friends).toEqual([])
    expect(((await app.inject({ method: 'GET', url: '/v1/friends', headers: auth(a.token) })).json() as { outgoing: unknown[]; incoming: unknown[] })).toMatchObject({ outgoing: [], incoming: [] })
  })
  it('unknown and own codes are refused', async () => {
    const a = await guest()
    expect((await app.inject({ method: 'POST', url: '/v1/friends', headers: auth(a.token), payload: { code: 'ZZZZZZ' } })).statusCode).toBe(404)
    expect((await app.inject({ method: 'POST', url: '/v1/friends', headers: auth(a.token), payload: { code: (await me(a.token)).friendCode } })).statusCode).toBe(400)
  })
})

describe('spirit director route', () => {
  const MOMENT = {
    kind: 'post',
    beast: { id: 'voltfang', trust: 40, respect: 30, courage: 4, pride: 2, curiosity: 1, calm: -3, battles: 5, awakened: null, memories: [] },
    battle: { won: true, comeback: false, finishes: ['spin'], perfectRips: 1, overspins: 0, spiritCalls: 1, aggression: 0.6, boss: null, opponent: 'Kaze' },
    reply: null,
  }
  it('returns the AI line, falls back on schema failure, enforces the daily cap and blocks flagged lines', async () => {
    let calls = 0, flag = false
    const fake = await buildApp(
      { databaseUrl: 'memory://', jwtSecret: 'test-secret-test-secret-test-secret-32', corsOrigins: ['*'], logLevel: 'silent', openaiKey: null },
      {
        director: async (_m, model) => {
          calls++
          const ok = model === 'gpt-4o-mini' || calls > 1
          return { model, inputTokens: 300, cachedTokens: 0, outputTokens: 40, usd: 0.0001, ms: 5, failure: ok ? null : 'schema', line: ok ? { line: 'Ha! Kaze never saw it.', mood: 'proud', nudge: { trait: 'courage', delta: 1 }, memory: null } : null }
        },
        moderator: async () => !flag,
        perPlayerDaily: 3,
      },
    )
    const g = (await fake.inject({ method: 'POST', url: '/v1/auth/guest' })).json() as { token: string }
    const h = { authorization: `Bearer ${g.token}` }
    const first = await fake.inject({ method: 'POST', url: '/v1/spirit/moment', headers: h, payload: MOMENT })
    expect(first.json()).toMatchObject({ line: 'Ha! Kaze never saw it.', mood: 'proud', nudge: { trait: 'courage', delta: 1 } })
    expect(calls).toBe(2)
    flag = true
    expect((await fake.inject({ method: 'POST', url: '/v1/spirit/moment', headers: h, payload: MOMENT })).json()).toMatchObject({ line: null })
    flag = false
    expect((await fake.inject({ method: 'POST', url: '/v1/spirit/moment', headers: h, payload: { ...MOMENT, beast: { ...MOMENT.beast, trust: 999 } } })).statusCode).toBe(400)
    const before = calls
    expect((await fake.inject({ method: 'POST', url: '/v1/spirit/moment', headers: h, payload: MOMENT })).json()).toMatchObject({ line: null, reason: 'player-cap' })
    expect(calls).toBe(before)
    await fake.close()
  })
})
