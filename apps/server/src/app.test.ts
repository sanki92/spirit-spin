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
