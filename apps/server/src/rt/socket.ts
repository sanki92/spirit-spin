import websocket from '@fastify/websocket'
import { NET, type ServerMsg, type Side } from '@spirit/core'
import type { FastifyInstance } from 'fastify'
import { randomInt } from 'node:crypto'
import { z } from 'zod'
import type { Tokens } from '../auth'
import { Room } from './room'

const num = z.number().finite()
const Build = z.object({ bladeId: z.string().max(20), discId: z.string().max(20), tipId: z.string().max(20), beastId: z.enum(['voltfang', 'aegiron', 'nagara', 'agnyx']) })
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
])

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const cleanName = (s: string) => s.replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 16) || 'Spinner'

export interface RealtimeOpts { seatHoldMs?: number; onResult?: (room: Room) => void; speed?: number }

export async function registerRealtime(app: FastifyInstance, tokens: Tokens, opts: RealtimeOpts = {}) {
  await app.register(websocket, { options: { maxPayload: NET.maxMessageBytes } })
  const rooms = new Map<string, Room>()
  const newCode = () => {
    for (;;) {
      const c = Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')
      if (!rooms.has(c)) return c
    }
  }
  const make = () => {
    const room = new Room(newCode(), { seatHoldMs: opts.seatHoldMs ?? NET.seatHoldMs, now: Date.now, onDone: r => rooms.delete(r.code), speed: opts.speed ?? 1, ...(opts.onResult ? { onResult: opts.onResult } : {}) })
    rooms.set(room.code, room)
    return room
  }
  app.addHook('onClose', async () => { for (const r of rooms.values()) r.close() })

  app.get('/rt', { websocket: true }, (socket, req) => {
    let playerId: string | null = null
    let name = 'Spinner'
    let room: Room | null = null
    let side: Side | null = null
    let windowStart = Date.now(), count = 0
    const send = (m: ServerMsg) => { if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(m)) }
    const fail = (code: Extract<ServerMsg, { k: 'error' }>['code'], close = true) => {
      send({ k: 'error', code })
      if (close) socket.close(4000, code)
    }
    const enter = (r: Room, build: Parameters<Room['seat']>[2]) => {
      const s = r.seat(playerId!, name, build, send)
      if (s === null) return fail('full', false)
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
        if ((m.k === 'create' || m.k === 'join') && room && side !== null && room.code !== (m.k === 'join' ? m.code : '')) {
          room.forfeit(side, 'quit')
          room = null
          side = null
        }
        if (m.k === 'create') {
          enter(make(), m.build)
        } else if (m.k === 'join' || m.k === 'rejoin') {
          const r = rooms.get(m.code)
          if (!r) return fail('no-room', false)
          const build = m.k === 'join' ? m.build : r.seats.find(s => s?.playerId === playerId)?.build
          if (!build) return fail('no-room', false)
          enter(r, build)
        } else if (room && side !== null) {
          if (m.k === 'rip') room.onRip(side, m)
          else if (m.k === 'inputs') room.onInputs(side, m.from, m.list)
          else if (m.k === 'leave') { room.forfeit(side, 'quit'); room = null; side = null }
        }
      } catch (e) {
        req.log.warn({ err: String(e) }, 'rt message rejected')
        fail('bad-message', false)
      }
    })
    socket.on('close', () => { if (room && side !== null) room.disconnect(side) })
  })

  return rooms
}
