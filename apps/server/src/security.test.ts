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
    expect(loadConfig(env).payments?.provider).toBe('none')
    expect(() => loadConfig({ ...env, RAZORPAY_KEY_ID: 'rzp_live_x', RAZORPAY_KEY_SECRET: 's' })).toThrow()
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
