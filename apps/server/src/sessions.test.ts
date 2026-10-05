import { SignJWT } from 'jose'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp, type App } from './app'

const SECRET = 'test-secret-test-secret-test-secret-32'
let app: App
beforeAll(async () => {
  app = await buildApp({ databaseUrl: 'memory://', jwtSecret: SECRET, corsOrigins: ['*'], logLevel: 'silent', openaiKey: null })
})
afterAll(async () => { await app.close() })

const auth = (token: string) => ({ authorization: `Bearer ${token}` })
const me = (token: string) => app.inject({ method: 'GET', url: '/v1/me', headers: auth(token) })

describe('one device per account', () => {
  it('recovering on a second device signs the first one out, and the second keeps working', async () => {
    const a = (await app.inject({ method: 'POST', url: '/v1/auth/guest' })).json() as { token: string; recoveryCode: string; playerId: string }
    expect((await me(a.token)).statusCode).toBe(200)
    const b = (await app.inject({ method: 'POST', url: '/v1/auth/recover', payload: { code: a.recoveryCode } })).json() as { token: string; playerId: string }
    expect(b.playerId).toBe(a.playerId)
    const old = await me(a.token)
    expect(old.statusCode).toBe(401)
    expect(old.json()).toEqual({ error: 'signed-out' })
    expect((await app.inject({ method: 'PUT', url: '/v1/save', headers: auth(a.token), payload: { baseVersion: 0, save: { coins: 1, xp: 0, tower: 0 } } })).json()).toEqual({ error: 'signed-out' })
    const fresh = await me(b.token)
    expect(fresh.statusCode).toBe(200)
    expect((await me(fresh.json().token)).statusCode).toBe(200)
  })

  it('an expired token from a replaced session is told it was signed out, not merely expired', async () => {
    const a = (await app.inject({ method: 'POST', url: '/v1/auth/guest' })).json() as { token: string; recoveryCode: string; playerId: string }
    const key = new TextEncoder().encode(SECRET)
    const past = Math.floor(Date.now() / 1000) - 3600
    const stale = await new SignJWT({ sid: 'old-session' }).setProtectedHeader({ alg: 'HS256' }).setSubject(a.playerId).setIssuedAt(past - 100).setExpirationTime(past).sign(key)
    expect((await me(stale)).json()).toEqual({ error: 'signed-out' })
    const forged = await new SignJWT({ sid: 'x' }).setProtectedHeader({ alg: 'HS256' }).setSubject(a.playerId).setExpirationTime(past).sign(new TextEncoder().encode('wrong-secret-wrong-secret-wrong-32'))
    expect((await me(forged)).json()).toEqual({ error: 'unauthorized' })
  })
})
