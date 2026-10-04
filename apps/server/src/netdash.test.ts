import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp, type App } from './app'

const CFG = { databaseUrl: 'memory://', jwtSecret: 'test-secret-test-secret-test-secret-32', corsOrigins: ['*'], logLevel: 'silent', openaiKey: null }
let dev: App
let prod: App
beforeAll(async () => {
  dev = await buildApp(CFG, { devShutdown: () => undefined })
  prod = await buildApp(CFG)
})
afterAll(async () => { await dev.close(); await prod.close() })

describe('netcode dashboard', () => {
  it('is served to loopback in dev, hidden elsewhere and in production without a key', async () => {
    const res = await dev.inject({ method: 'GET', url: '/__dev/net.json', remoteAddress: '127.0.0.1' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ summary: { counts: { rounds: 0, desyncs: 0 } } })
    const page = await dev.inject({ method: 'GET', url: '/__dev/net', remoteAddress: '127.0.0.1' })
    expect(page.statusCode).toBe(200)
    expect(page.headers['content-type']).toContain('text/html')
    expect((await dev.inject({ method: 'GET', url: '/__dev/net.json', remoteAddress: '10.0.0.9' })).statusCode).toBe(404)
    expect((await prod.inject({ method: 'GET', url: '/__dev/net.json', remoteAddress: '127.0.0.1' })).statusCode).toBe(404)
  })
})
