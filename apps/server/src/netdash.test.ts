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
  it('a request proxied from the internet is not loopback, even though the proxy connects locally', async () => {
    const r = await dev.inject({ method: 'GET', url: '/__dev/net.json', remoteAddress: '127.0.0.1', headers: { 'x-forwarded-for': '203.0.113.9' } })
    expect(r.statusCode).toBe(404)
    const s = await dev.inject({ method: 'POST', url: '/__dev/shutdown', remoteAddress: '127.0.0.1', headers: { 'x-forwarded-for': '203.0.113.9' } })
    expect(s.statusCode).toBe(404)
  })

  it('the key opens it remotely; a wrong or multibyte key is a clean 404', async () => {
    const keyed = await buildApp({ ...CFG, netDashKey: 'k3y-for-the-dashboard' })
    try {
      const ok = await keyed.inject({ method: 'GET', url: '/__dev/net.json?key=k3y-for-the-dashboard', remoteAddress: '127.0.0.1', headers: { 'x-forwarded-for': '203.0.113.9' } })
      expect(ok.statusCode).toBe(200)
      const multi = await keyed.inject({ method: 'GET', url: `/__dev/net.json?key=${encodeURIComponent('é'.repeat(21))}`, remoteAddress: '10.0.0.9' })
      expect(multi.statusCode).toBe(404)
      const wrong = await keyed.inject({ method: 'GET', url: '/__dev/net.json?key=nope', remoteAddress: '10.0.0.9' })
      expect(wrong.statusCode).toBe(404)
    } finally {
      await keyed.close()
    }
  })

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
