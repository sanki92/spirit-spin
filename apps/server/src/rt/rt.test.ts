import type { ServerMsg } from '@spirit/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp, type App } from '../app'

let app: App
let url = ''
beforeAll(async () => {
  app = await buildApp({ databaseUrl: 'memory://', jwtSecret: 'test-secret-test-secret-test-secret-32', corsOrigins: ['*'], logLevel: 'silent', openaiKey: null }, { realtime: { seatHoldMs: 1500, speed: 8 }, guestPerMinute: 1000 })
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
    await new Promise(r => setTimeout(r, 100))
    const fa = (await app.inject({ method: 'GET', url: '/v1/friends', headers: { authorization: `Bearer ${a.token}` } })).json() as { friends: { name: string }[] }
    expect(fa.friends.map(f => f.name)).toContain('Spinner')
    expect(fa.friends).toHaveLength(1)
    const ra = (await app.inject({ method: 'GET', url: '/v1/ranked', headers: { authorization: `Bearer ${a.token}` } })).json() as { ghostRips: number }
    expect(ra.ghostRips).toBeGreaterThan(0)
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

  it('a create with unknown parts leaves no room behind', async () => {
    const before = ((await app.inject({ method: 'GET', url: '/healthz' })).json() as { rooms: number }).rooms
    expect(typeof before).toBe('number')
    const c = await client()
    c.send({ k: 'hello', token: c.token, name: 'C' })
    await c.wait('welcome')
    for (let i = 0; i < 5; i++) c.send({ k: 'create', build: { bladeId: 'x', discId: 'x', tipId: 'x', beastId: 'voltfang' } })
    expect((await c.wait('error')).code).toBe('bad-message')
    await new Promise(r => setTimeout(r, 100))
    expect(((await app.inject({ method: 'GET', url: '/healthz' })).json() as { rooms: number }).rooms).toBeLessThanOrEqual(before)
    c.ws.close()
  })

  it('a stale socket closing after a rejoin does not drop the player', async () => {
    const { a, b, room } = await pair()
    await b.wait('room')
    const b2 = await client()
    b2.send({ k: 'hello', token: b.token, name: 'Bo' })
    await b2.wait('welcome')
    b2.send({ k: 'rejoin', code: room.code })
    expect((await b2.wait('room')).side).toBe(1)
    await new Promise(r => setTimeout(r, 200))
    expect(b.closed()).not.toBeNull()
    await new Promise(r => setTimeout(r, 1800))
    expect(a.msgs.some(m => m.k === 'left')).toBe(false)
    expect(a.msgs.filter(m => m.k === 'peer').at(-1)).toMatchObject({ online: true })
    a.ws.close(); b2.ws.close()
  })

  it('late inputs carry to the next tick and snapshots report input leads', async () => {
    const { a, b } = await pair()
    await a.wait('round'); await b.wait('round')
    a.send({ k: 'rip', round: 1, swipe: SWIPE, pull100: 7 })
    b.send({ k: 'rip', round: 1, swipe: SWIPE, pull100: 7 })
    await a.wait('start')
    const s1 = await a.wait('snap')
    a.send({ k: 'inputs', from: Math.max(1, s1.tick - 1), list: [[0.77, -0.5, 0]] })
    let seen = false
    for (let i = 0; i < 10 && !seen; i++) { const s = await a.wait('snap'); seen = s.inputs[0].x === 0.77; expect(s.leads).toHaveLength(2) }
    expect(seen).toBe(true)
    a.ws.close(); b.ws.close()
  })

  it('forged swipes are refused and motion data wins over a swipe', async () => {
    const { a, b } = await pair()
    await a.wait('round'); await b.wait('round')
    a.send({ k: 'rip', round: 1, swipe: { points: [{ t: 0, x: 0, y: 0 }, { t: 120, x: 0, y: 900 }], h: 900 }, pull100: 7 })
    b.send({ k: 'rip', round: 1, swipe: SWIPE, pull100: 7 })
    const st = await a.wait('start')
    expect(st.rips[0]).toMatchObject({ ok: false })
    expect(st.rips[1].ok).toBe(true)
    expect(st.rips[1].rpm).toBeLessThanOrEqual(13500)
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
