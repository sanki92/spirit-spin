import websocket from '@fastify/websocket'
import { assembleTop, COSMETICS, NET, type ServerMsg, type Side } from '@spirit/core'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { cleanName, randomCode, type Tokens } from '../auth'
import { Room } from './room'

const num = z.number().finite()
const LAUNCHERS = new Set(Object.values(COSMETICS).filter(c => c.kind === 'launcher').map(c => c.id))
const Build = z.object({ bladeId: z.string().max(20), discId: z.string().max(20), tipId: z.string().max(20), beastId: z.enum(['voltfang', 'aegiron', 'nagara', 'agnyx', 'zephyra', 'umbrax']), launcher: z.string().max(40).optional() })
  .transform(({ launcher, ...b }) => (launcher && LAUNCHERS.has(launcher) ? { ...b, launcher } : b))
const Code = z.string().regex(/^[A-Za-z0-9]{4}$/).transform(s => s.toUpperCase())
const Sample = z.object({ t: num, ax: num, ay: num, az: num, gx: num, gy: num, gz: num, roll: num })
const Msg = z.discriminatedUnion('k', [
  z.object({ k: z.literal('hello'), token: z.string().max(2000), name: z.string().max(40) }),
  z.object({ k: z.literal('create'), build: Build }),
  z.object({ k: z.literal('join'), code: Code, build: Build }),
  z.object({ k: z.literal('rejoin'), code: Code }),
  z.object({ k: z.literal('rip'), round: z.number().int().min(1).max(100), motion: z.array(Sample).max(260).optional(), swipe: z.object({ points: z.array(z.object({ t: num, x: num, y: num })).max(200), h: num }).optional(), pull100: num }),
  z.object({ k: z.literal('inputs'), from: z.number().int().min(0).max(1e6), list: z.array(z.tuple([num, num, z.number().int().min(0).max(1000)])).max(12) }),
  z.object({ k: z.literal('ping'), t: num }),
  z.object({ k: z.literal('leave') }),
  z.object({ k: z.literal('ready') }),
  z.object({ k: z.literal('stadium') }),
  z.object({ k: z.literal('watch'), code: Code }),
])


export interface RealtimeOpts { seatHoldMs?: number; onResult?: (room: Room) => void; speed?: number }

export async function registerRealtime(app: FastifyInstance, tokens: Tokens, opts: RealtimeOpts = {}) {
  await app.register(websocket, { options: { maxPayload: NET.maxMessageBytes } })
  const rooms = new Map<string, Room>()
  const newCode = () => {
    for (let i = 0; i < 100; i++) {
      const c = randomCode(4)
      if (!rooms.has(c)) return c
    }
    return null
  }
  const make = () => {
    const code = rooms.size < NET.maxRooms ? newCode() : null
    return code ? new Room(code, { seatHoldMs: opts.seatHoldMs ?? NET.seatHoldMs, now: Date.now, onDone: r => { rooms.delete(r.code); for (const [k, v] of owned) if (v === r) owned.delete(k) }, speed: opts.speed ?? 1, ...(opts.onResult ? { onResult: opts.onResult } : {}) }) : null
  }
  app.addHook('onClose', async () => { for (const r of rooms.values()) r.close() })
  const owned = new Map<string, Room>()

  app.get('/rt', { websocket: true }, (socket, req) => {
    let playerId: string | null = null
    let name = 'Spinner'
    let room: Room | null = null
    let side: Side | null = null
    let watching: Room | null = null
    let misses = 0

    let windowStart = Date.now(), count = 0
    const send = (m: ServerMsg) => { if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(m)) }
    const replaced = () => socket.close(4001, 'replaced')
    let alive = true
    socket.on('pong', () => { alive = true })
    const heartbeat = setInterval(() => {
      if (!alive) return socket.terminate()
      alive = false
      socket.ping()
    }, NET.heartbeatMs)
    const fail = (code: Extract<ServerMsg, { k: 'error' }>['code'], close = true) => {
      send({ k: 'error', code })
      if (close) socket.close(4000, code)
    }
    const enter = (r: Room, build: Parameters<Room['seat']>[2]) => {
      const s = r.seat(playerId!, name, build, send, replaced)
      if (s === null) return fail('full', false)
      if (!rooms.has(r.code)) rooms.set(r.code, r)
      room = r
      side = s
    }

    socket.on('message', async (raw: Buffer) => {
      const now = Date.now()
      if (now - windowStart > 1000) { windowStart = now; count = 0 }
      if (++count > NET.maxMsgsPerSec) return fail('rate')
      let parsed: z.infer<typeof Msg>
      try {
        const r = Msg.safeParse(JSON.parse(String(raw)))
        if (!r.success) return fail('bad-message')
        parsed = r.data
      } catch {
        return fail('bad-message')
      }
      const m = parsed
      if (m.k === 'ping') return send({ k: 'pong', t: m.t, server: Date.now() })
      if (m.k === 'hello') {
        const id = await tokens.verify(m.token)
        if (!id) return fail('auth')
        playerId = id
        name = cleanName(m.name)
        return send({ k: 'welcome', playerId: id })
      }
      if (!playerId) return fail('auth')
      if (room?.phase === 'done') { room = null; side = null }
      try {
        if (m.k === 'stadium') {
          if (watching) watching.unwatch(send)
          const r = make()
          if (!r) return fail('rate', false)
          rooms.set(r.code, r)
          r.watch(send)
          watching = r
          return
        }
        if (m.k === 'watch') {
          const r = rooms.get(m.code)
          if (!r) return fail('no-room', false)
          if (watching && watching !== r) watching.unwatch(send)
          if (!r.watch(send)) return fail('full', false)
          watching = r
          return
        }
        if (m.k === 'create' || m.k === 'join') assembleTop(m.build)
        if ((m.k === 'create' || m.k === 'join') && room && side !== null && room.code !== (m.k === 'join' ? m.code : '')) {
          room.forfeit(side, 'quit')
          room = null
          side = null
        }
        if (m.k === 'create') {
          const prev = owned.get(playerId)
          if (prev && prev !== room && prev.phase !== 'done') {
            const ps = prev.seats.findIndex(x => x?.playerId === playerId)
            if (ps >= 0) prev.forfeit(ps as Side, 'quit')
          }
          const r = make()
          if (!r) return fail('rate', false)
          enter(r, m.build)
          owned.set(playerId, r)
        } else if (m.k === 'join' || m.k === 'rejoin') {
          const r = rooms.get(m.code)
          if (!r) {
            if (++misses >= 5) return fail('no-room')
            return fail('no-room', false)
          }
          const build = m.k === 'join' ? m.build : r.seats.find(s => s?.playerId === playerId)?.build
          if (!build) return fail('no-room', false)
          enter(r, build)
        } else if (room && side !== null) {
          if (m.k === 'rip') room.onRip(side, m)
          else if (m.k === 'inputs') room.onInputs(side, m.from, m.list)
          else if (m.k === 'ready') room.onReady(side)
          else if (m.k === 'leave') { room.forfeit(side, 'quit'); room = null; side = null }
        } else if (m.k === 'leave' && watching) {
          watching.unwatch(send)
          watching = null
        }
      } catch (e) {
        req.log.warn({ err: String(e) }, 'rt message rejected')
        fail('bad-message', false)
      }
    })
    socket.on('close', () => {
      clearInterval(heartbeat)

      if (room && side !== null) room.disconnect(side, send)
      watching?.unwatch(send)
    })
  })

  return rooms
}
