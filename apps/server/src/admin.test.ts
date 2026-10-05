import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { hashAdminPassword } from './admin'
import { buildApp, type App } from './app'
import { discordNotifier } from './discord'

const said: string[] = []
let app: App
beforeAll(async () => {
  app = await buildApp(
    { databaseUrl: 'memory://', jwtSecret: 'test-secret-test-secret-test-secret-32', corsOrigins: ['*'], logLevel: 'silent', openaiKey: null, admin: { user: 'boss', passwordHash: hashAdminPassword('correct horse', 'salt123') } },
    { notifier: { say: t => said.push(t), stop: () => undefined } },
  )
})
afterAll(async () => { await app.close() })

const guest = async () => (await app.inject({ method: 'POST', url: '/v1/auth/guest' })).json() as { token: string; playerId: string }
const auth = (token: string) => ({ authorization: `Bearer ${token}` })
let cached: string | null = null
const login = async () => (cached ??= (await app.inject({ method: 'POST', url: '/v1/admin/login', payload: { user: 'boss', password: 'correct horse' } })).json().token as string)
const admin = (t: string) => ({ authorization: `Admin ${t}` })
const settle = () => new Promise(r => setTimeout(r, 300))

describe('admin', () => {
  it('rejects wrong credentials and unauthenticated calls', async () => {
    expect((await app.inject({ method: 'POST', url: '/v1/admin/login', payload: { user: 'boss', password: 'nope' } })).statusCode).toBe(401)
    expect((await app.inject({ method: 'GET', url: '/v1/admin/stats' })).statusCode).toBe(401)
    expect((await app.inject({ method: 'GET', url: '/v1/admin/stats', headers: admin('x.y') })).statusCode).toBe(401)
    expect((await app.inject({ method: 'GET', url: '/v1/admin/stats', headers: auth((await guest()).token) })).statusCode).toBe(401)
  })

  it('announces a new player once, when they pick a username', async () => {
    const g = await guest()
    await app.inject({ method: 'POST', url: '/v1/username', headers: auth(g.token), payload: { username: 'Rookie_one' } })
    await app.inject({ method: 'POST', url: '/v1/username', headers: auth(g.token), payload: { username: 'Rookie_two' } })
    expect(said.filter(s => s.includes('New player joined'))).toEqual([expect.stringContaining('@Rookie_one')])
  })

  it('records the last IP and location, and finds the player by it', async () => {
    const g = await guest()
    await app.inject({ method: 'GET', url: '/v1/me', headers: auth(g.token) })
    await settle()
    const t = await login()
    const d = (await app.inject({ method: 'GET', url: `/v1/admin/players/${g.playerId}`, headers: admin(t) })).json()
    expect(d.player).toMatchObject({ lastIp: '127.0.0.1', country: 'LAN' })
    expect(d.ips[0]).toMatchObject({ ip: '127.0.0.1' })
    const found = (await app.inject({ method: 'GET', url: `/v1/admin/players?q=${g.playerId}`, headers: admin(t) })).json()
    expect(found.players.map((p: { id: string }) => p.id)).toContain(g.playerId)
  })

  it('bans and unbans a player, with the reason shown to them', async () => {
    const g = await guest()
    const t = await login()
    expect((await app.inject({ method: 'POST', url: `/v1/admin/players/${g.playerId}/ban`, headers: admin(t), payload: { reason: 'cheating' } })).statusCode).toBe(200)
    const me = await app.inject({ method: 'GET', url: '/v1/me', headers: auth(g.token) })
    expect(me.statusCode).toBe(403)
    expect(me.json()).toEqual({ error: 'banned', reason: 'cheating' })
    expect(said.some(s => s.includes('Banned') && s.includes('cheating') && s.includes('by boss'))).toBe(true)
    const bans = (await app.inject({ method: 'GET', url: '/v1/admin/bans', headers: admin(t) })).json()
    expect(bans.players.map((p: { id: string }) => p.id)).toContain(g.playerId)
    await app.inject({ method: 'POST', url: `/v1/admin/players/${g.playerId}/unban`, headers: admin(t) })
    expect((await app.inject({ method: 'GET', url: '/v1/me', headers: auth(g.token) })).statusCode).toBe(200)
  })

  it('an IP ban blocks new guests and existing players on that IP until lifted', async () => {
    const g = await guest()
    const t = await login()
    const r = await app.inject({ method: 'POST', url: '/v1/admin/ip-bans', headers: admin(t), payload: { ip: '127.0.0.1', reason: 'spam farm' } })
    expect(r.statusCode).toBe(200)
    expect((await app.inject({ method: 'POST', url: '/v1/auth/guest' })).statusCode).toBe(403)
    expect((await app.inject({ method: 'GET', url: '/v1/me', headers: auth(g.token) })).json()).toEqual({ error: 'banned', reason: 'spam farm' })
    await app.inject({ method: 'DELETE', url: '/v1/admin/ip-bans/127.0.0.1', headers: admin(t) })
    expect((await app.inject({ method: 'POST', url: '/v1/auth/guest' })).statusCode).toBe(200)
  })

  it('grants coins and shards so the phone adopts the new save', async () => {
    const g = await guest()
    await app.inject({ method: 'PUT', url: '/v1/save', headers: auth(g.token), payload: { baseVersion: 0, save: { version: 1, coins: 100, shards: 2, xp: 5, tower: 0, starter: 'voltfang', beasts: {}, owned: { blades: [], discs: [], tips: [] } } } })
    const t = await login()
    const r = await app.inject({ method: 'POST', url: `/v1/admin/players/${g.playerId}/grant`, headers: admin(t), payload: { coins: 500, shards: 10 } })
    expect(r.json()).toMatchObject({ coins: 600, shards: 12 })
    const me = (await app.inject({ method: 'GET', url: '/v1/me', headers: auth(g.token) })).json()
    expect(me).toMatchObject({ version: 2, save: { coins: 600, shards: 12, xp: 6 } })
  })

  it('serves stats, live rooms, the action log, and an empty history for a new player', async () => {
    const t = await login()
    const s = (await app.inject({ method: 'GET', url: '/v1/admin/stats', headers: admin(t) })).json()
    expect(s.players.total).toBeGreaterThan(0)
    expect(s.live).toMatchObject({ rooms: 0 })
    expect((await app.inject({ method: 'GET', url: '/v1/admin/live', headers: admin(t) })).json()).toMatchObject({ rooms: [], recent: [] })
    expect((await app.inject({ method: 'GET', url: '/v1/admin/log', headers: admin(t) })).json().log.length).toBeGreaterThan(0)
    const g = await guest()
    expect((await app.inject({ method: 'GET', url: '/v1/history', headers: auth(g.token) })).json()).toEqual({ matches: [] })
  })
})

describe('discord notifier', () => {
  it('posts in order, defuses mass mentions, and ignores non-Discord URLs', async () => {
    const posted: string[] = []
    const n = discordNotifier('https://discord.com/api/webhooks/1/abc', { gapMs: 5, post: (async (_u: unknown, init?: RequestInit) => { posted.push(JSON.parse(String(init?.body)).content); return new Response(null, { status: 204 }) }) as typeof fetch })
    n.say('one')
    n.say('hey @everyone')
    await new Promise(r => setTimeout(r, 80))
    n.stop()
    expect(posted).toEqual(['one', 'hey @​everyone'])
    const quiet = discordNotifier('https://evil.example/hook')
    quiet.say('x')
    quiet.stop()
  })
})
