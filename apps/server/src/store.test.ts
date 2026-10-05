import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { SKUS } from '@spirit/core'
import { buildApp, type App } from './app'

let app: App
beforeAll(async () => {
  app = await buildApp({ databaseUrl: 'memory://', jwtSecret: 'test-secret-test-secret-test-secret-32', corsOrigins: ['*'], logLevel: 'silent', openaiKey: null }, { guestPerMinute: 1000, trustSaves: true })
})
afterAll(async () => { await app.close() })

const guest = async () => (await app.inject({ method: 'POST', url: '/v1/auth/guest' })).json() as { token: string; playerId: string }
const h = (t: string) => ({ authorization: `Bearer ${t}` })
const save = (t: string, coins: number, baseVersion = 0) => app.inject({ method: 'PUT', url: '/v1/save', headers: h(t), payload: { baseVersion, save: { coins, xp: 0, tower: 0 } } })
const buy = (t: string, sku: string) => app.inject({ method: 'POST', url: '/v1/store/buy', headers: h(t), payload: { sku } })

describe('coin store', () => {
  it('everything is priced in coins, never money', () => {
    for (const k of Object.values(SKUS)) {
      expect(k.coins).toBeGreaterThanOrEqual(15000)
      expect(k).not.toHaveProperty('paise')
    }
  })

  it('spends server-side coins, grants the item once, and the save reflects it', async () => {
    const g = await guest()
    await save(g.token, 60000)
    const r = await buy(g.token, 'pass-s1')
    expect(r.statusCode).toBe(200)
    expect(r.json()).toMatchObject({ coins: 10000, version: 2, items: ['pass-s1'] })
    const me = (await app.inject({ method: 'GET', url: '/v1/me', headers: h(g.token) })).json()
    expect(me.save.coins).toBe(10000)
    expect(me.save.entitlements).toContain('pass-s1')
    expect((await buy(g.token, 'pass-s1')).statusCode).toBe(409)
  })

  it('refuses when the player cannot afford it, and says how many coins are missing', async () => {
    const g = await guest()
    await save(g.token, 1000)
    const r = await buy(g.token, 'launcher-voltfang')
    expect(r.statusCode).toBe(402)
    expect(r.json()).toMatchObject({ need: 14000, coins: 1000 })
    expect((await app.inject({ method: 'GET', url: '/v1/entitlements', headers: h(g.token) })).json()).toEqual({ items: [] })
  })

  it('rejects unknown items and the old money endpoints are gone', async () => {
    const g = await guest()
    expect((await buy(g.token, 'free-stuff')).statusCode).toBe(400)
    expect((await app.inject({ method: 'POST', url: '/v1/store/order', headers: h(g.token), payload: { sku: 'pass-s1' } })).statusCode).toBe(404)
  })
})
