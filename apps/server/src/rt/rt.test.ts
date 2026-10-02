import type { ServerMsg } from '@spirit/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp, type App } from '../app'

let app: App
let url = ''
beforeAll(async () => {
  app = await buildApp({ databaseUrl: 'memory://', jwtSecret: 'test-secret-test-secret-test-secret-32', corsOrigins: ['*'], logLevel: 'silent', openaiKey: null }, { realtime: { seatHoldMs: 1500, speed: 8 } })
  await app.listen({ port: 0, host: '127.0.0.1' })
  const addr = app.server.address()
  url = `ws://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}/rt`
})
afterAll(async () => { await app.close() })

const BUILD_A = { bladeId: 'fang', discId: 'standard', tipId: 'flat', beastId: 'voltfang' } as const
const BUILD_B = { bladeId: 'bastion', discId: 'heavy', tipId: 'ball', beastId: 'aegiron' } as const
const SWIPE = { points: Array.from({ length: 11 }, (_, i) => ({ t: 10 + i * 16, x: 200, y: 100 + i * 50 })), h: 800 }

async function client() {
  const token = ((await app.inject({ method: 'POST', url: '/v1/auth/guest' })).json() as { token: string }).token
  const ws = new WebSocket(url)
  const msgs: ServerMsg[] = []
  const cursor: Record<string, number> = {}
  let wake: (() => void) | null = null
  let closed: number | null = null
  ws.onmessage = e => { msgs.push(JSON.parse(String(e.data)) as ServerMsg); wake?.() }
  ws.onclose = e => { closed = e.code; wake?.() }
  await new Promise(r => { ws.onopen = r })
  const send = (m: unknown) => ws.send(typeof m === 'string' ? m : JSON.stringify(m))
  const wait = async <K extends ServerMsg['k']>(k: K, ms = 8000): Promise<Extract<ServerMsg, { k: K }>> => {
    const end = Date.now() + ms
    for (;;) {
      const from = cursor[k] ?? 0
      const i = msgs.findIndex((m, j) => j >= from && m.k === k)
      if (i >= 0) { cursor[k] = i + 1; return msgs[i] as Extract<ServerMsg, { k: K }> }
      if (Date.now() > end) throw new Error(`timeout waiting for ${k}; got ${msgs.map(m => m.k).join(',')}`)
      await new Promise<void>(r => { wake = r; setTimeout(r, 50) })
    }
  }
  return { ws, token, msgs, send, wait, closed: () => closed }
}

async function pair() {
  const a = await client(), b = await client()
  a.send({ k: 'hello', token: a.token, name: 'Aki' })
  b.send({ k: 'hello', token: b.token, name: 'Bo<script>' })
  await a.wait('welcome'); await b.wait('welcome')
  a.send({ k: 'create', build: BUILD_A })
  const room = await a.wait('room')
  b.send({ k: 'join', code: room.code.toLowerCase(), build: BUILD_B })
  return { a, b, room }
}

describe('realtime', () => {
  it('pairs two players, judges rips server-side, streams snapshots and finishes a match', async () => {
    const { a, b, room } = await pair()
    expect(room.side).toBe(0)
    expect((await b.wait('room')).side).toBe(1)
    expect((await a.wait('peer')).name).toBe('Boscript')
    let rounds = 0
    for (;;) {
      const ra = await a.wait('round'), rb = await b.wait('round')
      expect(ra).toEqual(rb)
      a.send({ k: 'rip', round: ra.round, swipe: SWIPE, pull100: 7 })
      b.send({ k: 'rip', round: ra.round, pull100: 7 })
      const sa = await a.wait('start'), sb = await b.wait('start')
      expect(sa).toEqual(sb)
      expect(sa.rips[0]).toMatchObject({ ok: true })
      expect(sa.rips[1]).toMatchObject({ ok: false, reason: 'no-pull' })
      a.send({ k: 'inputs', from: 1, list: [[0.5, 0, 0], [0.5, 0, 0], [0.5, 0, 1]] })
      const s1 = await a.wait('snap')
      expect(s1.tick % 3 === 0 || s1.state.outcome).toBeTruthy()
      const end = await a.wait('end', 20000)
      expect(await b.wait('end', 20000)).toEqual(end)
      rounds++
      if (end.winner !== null) { expect(end.scores[end.winner]).toBeGreaterThanOrEqual(4); break }
    }
    expect(rounds).toBeGreaterThan(0)
    a.ws.close(); b.ws.close()
  }, 120000)

  it('the same socket can host a new battle after a match ends', async () => {
    const { a, b, room } = await pair()
    b.send({ k: 'leave' })
    expect((await a.wait('left')).reason).toBe('quit')
    a.send({ k: 'create', build: BUILD_A })
    const next = await a.wait('room')
    expect(next.code).not.toBe(room.code)
    a.ws.close(); b.ws.close()
  })

  it('hosting again mid-match forfeits the old room instead of hanging', async () => {
    const { a, b } = await pair()
    await b.wait('room')
    a.send({ k: 'create', build: BUILD_A })
    expect((await b.wait('left')).reason).toBe('quit')
    expect((await a.wait('room')).side).toBe(0)
    a.ws.close(); b.ws.close()
  })

  it('rejects bad tokens and malformed messages', async () => {
    const c = await client()
    c.send({ k: 'hello', token: 'a.b.c', name: 'x' })
    expect((await c.wait('error')).code).toBe('auth')
    const d = await client()
    d.send('{nope')
    expect((await d.wait('error')).code).toBe('bad-message')
    const e = await client()
    e.send({ k: 'create', build: BUILD_A })
    expect((await e.wait('error')).code).toBe('auth')
  })

  it('unknown room code and full rooms are refused without closing', async () => {
    const { a, b, room } = await pair()
    const c = await client()
    c.send({ k: 'hello', token: c.token, name: 'C' })
    await c.wait('welcome')
    c.send({ k: 'join', code: 'ZZZZ', build: BUILD_A })
    expect((await c.wait('error')).code).toBe('no-room')
    c.send({ k: 'join', code: room.code, build: BUILD_A })
    expect((await c.wait('error')).code).toBe('full')
    expect(c.closed()).toBeNull()
    a.ws.close(); b.ws.close(); c.ws.close()
  })

  it('a dropped player forfeits after the seat hold; rejoining in time keeps the seat', async () => {
    const { a, b, room } = await pair()
    await b.wait('room')
    b.ws.close()
    expect((await a.wait('peer')).online).toBe(true)
    expect((await a.wait('peer')).online).toBe(false)
    const b2 = await client()
    b2.send({ k: 'hello', token: b.token, name: 'Bo' })
    await b2.wait('welcome')
    b2.send({ k: 'rejoin', code: room.code })
    expect((await b2.wait('room')).side).toBe(1)
    b2.ws.close()
    expect((await a.wait('left', 5000)).reason).toBe('forfeit')
    a.ws.close()
  })
})
