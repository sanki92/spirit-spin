import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp, type App } from './app'
import { loadConfig } from './config'
import { playGhost, type Issued } from './test-utils'

let app: App
beforeAll(async () => {
  app = await buildApp({ databaseUrl: 'memory://', jwtSecret: 'test-secret-test-secret-test-secret-32', corsOrigins: ['*'], logLevel: 'silent', openaiKey: null }, { guestPerMinute: 1000 })
})
afterAll(async () => { await app.close() })

const guest = async () => (await app.inject({ method: 'POST', url: '/v1/auth/guest' })).json() as { token: string; playerId: string; recoveryCode: string }
const h = (t: string) => ({ authorization: `Bearer ${t}` })
const BASE = { coins: 1, xp: 0, tower: 0 }

describe('security', () => {
  it('production refuses dev tools and requires explicit CORS origins', () => {
    const env = { NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(40), RECOVERY_PEPPER: 'y'.repeat(40), CORS_ORIGINS: 'https://play.example.com' }
    expect(() => loadConfig({ ...env, DEV_TOOLS: '1' })).toThrow()
    expect(() => loadConfig({ ...env, CORS_ORIGINS: undefined })).toThrow()
  })

  it('reading your profile refreshes your token', async () => {
    const g = await guest()
    const me = (await app.inject({ method: 'GET', url: '/v1/me', headers: h(g.token) })).json() as { token: string }
    expect(me.token.split('.')).toHaveLength(3)
    expect((await app.inject({ method: 'GET', url: '/v1/me', headers: h(me.token) })).statusCode).toBe(200)
  })

  it('friendship needs both players to add each other', async () => {
    const a = await guest(), b = await guest()
    const code = async (t: string) => ((await app.inject({ method: 'GET', url: '/v1/me', headers: h(t) })).json() as { friendCode: string }).friendCode
    await app.inject({ method: 'POST', url: '/v1/friends', headers: h(a.token), payload: { code: await code(b.token) } })
    const list = async (t: string) => (await app.inject({ method: 'GET', url: '/v1/friends', headers: h(t) })).json() as { friends: { playerId: string }[]; incoming: { playerId: string }[]; outgoing: { playerId: string }[] }
    expect((await list(a.token)).friends).toHaveLength(0)
    expect((await list(a.token)).outgoing.map(f => f.playerId)).toEqual([b.playerId])
    expect((await list(b.token)).incoming.map(f => f.playerId)).toEqual([a.playerId])
    await app.inject({ method: 'POST', url: '/v1/friends', headers: h(b.token), payload: { code: await code(a.token) } })
    expect((await list(a.token)).friends.map(f => f.playerId)).toEqual([b.playerId])
    expect((await list(b.token)).friends.map(f => f.playerId)).toEqual([a.playerId])
  })

  it('entitlements and premium unlocks in a save are decided by the server', async () => {
    const g = await guest()
    await app.inject({ method: 'PUT', url: '/v1/save', headers: h(g.token), payload: { baseVersion: 0, save: { ...BASE, entitlements: ['pass-s1'], unlocks: ['stadium-volcano', 'frame-rare'], pass: { season: 's1', baseXp: 0, free: [10], premium: [12] } } } })
    const me = (await app.inject({ method: 'GET', url: '/v1/me', headers: h(g.token) })).json() as { save: { entitlements: string[]; unlocks: string[]; pass: { premium: number[] } } }
    expect(me.save.entitlements).toEqual([])
    expect(me.save.unlocks).not.toContain('stadium-volcano')
    expect(me.save.pass.premium).toEqual([])
  })

  it('parallel plays on one pairing issue a single attempt', async () => {
    const players = []
    for (let i = 0; i < 4; i++) players.push(await guest())
    const t = (await app.inject({ method: 'POST', url: '/v1/tournaments', headers: h(players[0]!.token), payload: { name: 'Race Cup' } })).json() as { id: string; code: string }
    for (const p of players.slice(1)) await app.inject({ method: 'POST', url: '/v1/tournaments/join', headers: h(p.token), payload: { code: t.code } })
    await app.inject({ method: 'POST', url: `/v1/tournaments/${t.id}/start`, headers: h(players[0]!.token) })
    const d = (await app.inject({ method: 'GET', url: `/v1/tournaments/${t.id}`, headers: h(players[0]!.token) })).json() as { pairings: { id: string; a: string; b: string | null }[] }
    const p = d.pairings.find(x => x.b)!
    const tok = players.find(x => x.playerId === p.a)!.token
    const res = await Promise.all([0, 1, 2].map(() => app.inject({ method: 'POST', url: `/v1/tournaments/${t.id}/pairings/${p.id}/play`, headers: h(tok), payload: { pool: 'swipe' } })))
    expect(res.filter(r => r.statusCode === 200)).toHaveLength(1)
    const issued = res.find(r => r.statusCode === 200)!.json() as Issued
    expect(playGhost(issued).match.winner).not.toBeNull()
  })

  it('server errors do not leak internals', async () => {
    const g = await guest()
    const r = await app.inject({ method: 'PUT', url: '/v1/save', headers: h(g.token), payload: { baseVersion: 0, save: { ...BASE, junk: 'bad\u0000byte' } } })
    expect(r.statusCode === 200 || r.statusCode >= 400).toBe(true)
    if (r.statusCode >= 500) expect(r.json()).toEqual({ error: 'internal error' })
  })
})

describe('rate limits behind carrier NAT', () => {
  it('signed-in players sharing one IP do not throttle each other, while one player is still limited', async () => {
    const players = await Promise.all(Array.from({ length: 3 }, () => guest()))
    const hit = (t: string) => app.inject({ method: 'GET', url: '/v1/me', headers: h(t), remoteAddress: '100.64.0.7' })
    for (let i = 0; i < 100; i++) for (const p of players) expect((await hit(p.token)).statusCode, `round ${i}`).toBe(200)
    let limited = false
    for (let i = 0; i < 60 && !limited; i++) limited = (await hit(players[0]!.token)).statusCode === 429
    expect(limited).toBe(true)
  })
})

describe('audit fixes', () => {
  it('production refuses placeholder secrets and keeps ranked and cups off', () => {
    const env = { NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(40), RECOVERY_PEPPER: 'y'.repeat(40), CORS_ORIGINS: 'https://play.example.com' }
    expect(() => loadConfig({ ...env, JWT_SECRET: 'replace-with-a-long-random-secret-abcdef' })).toThrow()
    expect(loadConfig(env).competitive).toBe(false)
  })

  it('a forged token cannot open a fresh rate-limit bucket', async () => {
    const forged = (n: number) => `x.${Buffer.from(JSON.stringify({ sub: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}` })).toString('base64url')}.y`
    let limited = false
    for (let i = 0; i < 15 && !limited; i++) {
      const r = await app.inject({ method: 'POST', url: '/v1/auth/recover', headers: { authorization: `Bearer ${forged(i)}` }, payload: { code: 'AAAA-AAAA-AAAA' } })
      limited = r.statusCode === 429
    }
    expect(limited).toBe(true)
  })

  it('an edited save is cut back to what time allows and the phone is told', async () => {
    const strict = await buildApp({ databaseUrl: 'memory://', jwtSecret: 'test-secret-test-secret-test-secret-32', corsOrigins: ['*'], logLevel: 'silent', openaiKey: null }, { guestPerMinute: 1000 })
    const g = (await strict.inject({ method: 'POST', url: '/v1/auth/guest' })).json() as { token: string }
    const r = await strict.inject({ method: 'PUT', url: '/v1/save', headers: h(g.token), payload: { baseVersion: 0, save: { coins: 9_999_999, xp: 0, tower: 0 } } })
    expect(r.json()).toMatchObject({ version: 1, clamped: ['coins'], save: { coins: 6150 } })
    const fair = await strict.inject({ method: 'PUT', url: '/v1/save', headers: h(g.token), payload: { baseVersion: 1, save: { coins: 6200, xp: 40, tower: 0 } } })
    expect(fair.json()).toEqual({ version: 2 })
    await strict.close()
  })

  it('pass rewards above the earned tier are dropped', async () => {
    const g = await guest()
    const r = await app.inject({ method: 'PUT', url: '/v1/save', headers: h(g.token), payload: { baseVersion: 0, save: { ...BASE, xp: 50, pass: { season: 's1', baseXp: -100000, free: [1, 2, 30], premium: [] } } } })
    expect(r.statusCode).toBe(200)
    const me = (await app.inject({ method: 'GET', url: '/v1/me', headers: h(g.token) })).json()
    expect(me.save.pass).toMatchObject({ baseXp: 0, free: [] })
  })

  it('a developer-tools report is accepted once per reason window and needs a login', async () => {
    const g = await guest()
    expect((await app.inject({ method: 'POST', url: '/v1/security/flag', payload: { reason: 'debugger' } })).statusCode).toBe(401)
    expect((await app.inject({ method: 'POST', url: '/v1/security/flag', headers: h(g.token), payload: { reason: 'debugger' } })).statusCode).toBe(200)
    expect((await app.inject({ method: 'POST', url: '/v1/security/flag', headers: h(g.token), payload: { reason: 'hax' } })).statusCode).toBe(400)
  })

  it('a crash report from the app is accepted without login but bounded and rate limited', async () => {
    const send = (payload: object) => app.inject({ method: 'POST', url: '/v1/client-error', remoteAddress: '203.0.113.9', payload })
    expect((await send({ kind: 'render', msg: 'boom', screen: 'garage' })).statusCode).toBe(200)
    expect((await send({ kind: 'render', msg: 'x'.repeat(5000) })).statusCode).toBe(400)
    const codes = new Set<number>()
    for (let i = 0; i < 6; i++) codes.add((await send({ kind: 'render', msg: 'again' })).statusCode)
    expect(codes.has(429)).toBe(true)
  })

  it('round perf reports from two phones on one Wi-Fi never crowd out a crash report', async () => {
    const ip = '203.0.113.44'
    for (let i = 0; i < 12; i++) expect((await app.inject({ method: 'POST', url: '/v1/client-perf', remoteAddress: ip, payload: { kind: 'net.perf', msg: '{"fps":30}' } })).statusCode).toBe(200)
    expect((await app.inject({ method: 'POST', url: '/v1/client-perf', remoteAddress: ip, payload: { kind: 'net.perf', msg: 'x'.repeat(5000) } })).statusCode).toBe(400)
    expect((await app.inject({ method: 'POST', url: '/v1/client-error', remoteAddress: ip, payload: { kind: 'render', msg: 'boom' } })).statusCode).toBe(200)
  })
})

describe('static files are never rate limited', () => {
  it('only API routes count toward the per-player limit', async () => {
    const codes = new Set<number>()
    for (let i = 0; i < 140; i++) codes.add((await app.inject({ method: 'GET', url: '/healthz' })).statusCode)
    expect([...codes]).toEqual([200])
    const r = await app.inject({ method: 'GET', url: '/healthz' })
    expect(r.headers['x-ratelimit-limit']).toBeUndefined()
  })
})
