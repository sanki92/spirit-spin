import { createHmac } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp, type App } from './app'

const PAY_SECRET = 'pay-secret-for-tests'
const HOOK_SECRET = 'hook-secret-for-tests'
let app: App
beforeAll(async () => {
  app = await buildApp({ databaseUrl: 'memory://', jwtSecret: 'test-secret-test-secret-test-secret-32', corsOrigins: ['*'], logLevel: 'silent', openaiKey: null }, { guestPerMinute: 1000, payments: { provider: 'dev', keySecret: PAY_SECRET, webhookSecret: HOOK_SECRET } })
})
afterAll(async () => { await app.close() })

const guest = async () => (await app.inject({ method: 'POST', url: '/v1/auth/guest' })).json() as { token: string; playerId: string }
const h = (t: string) => ({ authorization: `Bearer ${t}` })
const sign = (orderId: string, paymentId: string, secret = PAY_SECRET) => createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex')
const order = async (token: string, sku: string) => app.inject({ method: 'POST', url: '/v1/store/order', headers: h(token), payload: { sku } })
const entitlements = async (token: string) => ((await app.inject({ method: 'GET', url: '/v1/entitlements', headers: h(token) })).json() as { items: string[] }).items

describe('store', () => {
  it('a correctly signed payment grants the entitlement once, idempotently', async () => {
    const g = await guest()
    const o = (await order(g.token, 'pass-s1')).json() as { orderId: string; amount: number; provider: string }
    expect(o).toMatchObject({ amount: 14900, provider: 'dev' })
    const body = { orderId: o.orderId, paymentId: 'pay_123', signature: sign(o.orderId, 'pay_123') }
    const v = await app.inject({ method: 'POST', url: '/v1/store/verify', headers: h(g.token), payload: body })
    expect(v.statusCode).toBe(200)
    expect(await entitlements(g.token)).toEqual(['pass-s1'])
    expect((await app.inject({ method: 'POST', url: '/v1/store/verify', headers: h(g.token), payload: body })).statusCode).toBe(200)
    expect(await entitlements(g.token)).toEqual(['pass-s1'])
  })

  it('bad signatures, unknown skus and other players orders are refused', async () => {
    const a = await guest(), b = await guest()
    expect((await order(a.token, 'free-money')).statusCode).toBe(400)
    const o = (await order(a.token, 'stadium-volcano')).json() as { orderId: string }
    expect((await app.inject({ method: 'POST', url: '/v1/store/verify', headers: h(a.token), payload: { orderId: o.orderId, paymentId: 'pay_1', signature: sign(o.orderId, 'pay_1', 'wrong') } })).statusCode).toBe(400)
    expect((await app.inject({ method: 'POST', url: '/v1/store/verify', headers: h(b.token), payload: { orderId: o.orderId, paymentId: 'pay_1', signature: sign(o.orderId, 'pay_1') } })).statusCode).toBe(404)
    expect(await entitlements(a.token)).toEqual([])
    expect(await entitlements(b.token)).toEqual([])
  })

  it('the dev checkout simulates a signed payment', async () => {
    const g = await guest()
    const o = (await order(g.token, 'launcher-nagara')).json() as { orderId: string }
    const pay = (await app.inject({ method: 'POST', url: '/v1/store/dev/pay', headers: h(g.token), payload: { orderId: o.orderId } })).json() as { paymentId: string; signature: string }
    expect((await app.inject({ method: 'POST', url: '/v1/store/verify', headers: h(g.token), payload: { orderId: o.orderId, ...pay } })).statusCode).toBe(200)
    expect(await entitlements(g.token)).toEqual(['launcher-nagara'])
  })

  it('webhooks need a valid signature over the raw body', async () => {
    const g = await guest()
    const o = (await order(g.token, 'frame-legendary')).json() as { orderId: string }
    const raw = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_9', order_id: o.orderId } } } })
    const bad = await app.inject({ method: 'POST', url: '/v1/store/webhook', headers: { 'content-type': 'application/json', 'x-razorpay-signature': 'nope' }, payload: raw })
    expect(bad.statusCode).toBe(400)
    const good = await app.inject({ method: 'POST', url: '/v1/store/webhook', headers: { 'content-type': 'application/json', 'x-razorpay-signature': createHmac('sha256', HOOK_SECRET).update(raw).digest('hex') }, payload: raw })
    expect(good.statusCode).toBe(200)
    expect(await entitlements(g.token)).toEqual(['frame-legendary'])
  })
})
