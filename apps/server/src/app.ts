import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import { and, eq } from 'drizzle-orm'
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify'
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { cleanName, hashRecoveryCode, newRecoveryCode, randomCode, Tokens } from './auth'
import type { Config } from './config'
import { openDb, players, aiCalls, friendships, type Db } from './db'
import { directSpirit, moderate, type DirectorResult } from './spirit/director'
import type { MomentInput } from './spirit/prompt'
import { registerRealtime, type RealtimeOpts } from './rt/socket'
import { desc, gte, sql } from 'drizzle-orm'

const SaveBody = z.object({
  baseVersion: z.number().int().min(0),
  save: z
    .object({
      coins: z.number().int().min(0).max(10_000_000),
      xp: z.number().int().min(0).max(100_000_000),
      tower: z.number().int().min(0).max(50),
    })
    .passthrough(),
})

declare module 'fastify' {
  interface FastifyRequest { playerId: string }
}

export type App = Awaited<ReturnType<typeof buildApp>>

export interface Deps { director?: (m: MomentInput, model: string) => Promise<DirectorResult>; moderator?: (text: string) => Promise<boolean>; perPlayerDaily?: number; realtime?: RealtimeOpts; devShutdown?: () => void; guestPerMinute?: number }

const Trait = z.number().int().min(-10).max(10)
const MomentBody = z.object({
  kind: z.enum(['post', 'reply', 'greet', 'awaken']),
  beast: z.object({
    id: z.enum(['voltfang', 'aegiron', 'nagara', 'agnyx']),
    trust: z.number().int().min(0).max(100), respect: z.number().int().min(0).max(100),
    courage: Trait, pride: Trait, curiosity: Trait, calm: Trait,
    battles: z.number().int().min(0).max(1_000_000), awakened: z.string().max(20).nullable(),
    memories: z.array(z.object({ text: z.string().max(120), importance: z.number().int().min(1).max(5) })).max(50),
  }),
  battle: z.object({
    won: z.boolean(), comeback: z.boolean(), finishes: z.array(z.enum(['spin', 'ringout', 'shatter', 'spirit', 'draw'])).max(20),
    perfectRips: z.number().int().min(0).max(20), overspins: z.number().int().min(0).max(20), spiritCalls: z.number().int().min(0).max(20),
    aggression: z.number().min(0).max(1), boss: z.enum(['kaze', 'mira', 'brick', 'vex', 'ren']).nullable(), opponent: z.string().min(1).max(40),
  }).nullable(),
  reply: z.enum(['celebrate', 'humble', 'push', 'comfort', 'analyze', 'fireup']).nullable(),
})

export const AI = { primary: 'gpt-4.1-nano', fallback: 'gpt-4o-mini', perPlayerDaily: 30, globalDailyUsd: 3 }

export async function buildApp(cfg: Config, deps: Deps = {}) {
  const app = Fastify({ logger: cfg.logLevel === 'silent' ? false : { level: cfg.logLevel }, bodyLimit: 256 * 1024, trustProxy: true }).withTypeProvider<ZodTypeProvider>()
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  const { db, close } = await openDb(cfg.databaseUrl)
  const tokens = new Tokens(cfg.jwtSecret)
  app.addHook('onClose', close)
  await app.register(cors, { origin: cfg.corsOrigins.includes('*') ? true : cfg.corsOrigins })
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' })
  const rooms = await registerRealtime(app, tokens, {
    ...deps.realtime,
    onResult: room => {
      const [a, b] = room.seats
      if (a && b && a.playerId !== b.playerId) void befriend(db, a.playerId, b.playerId).catch(e => app.log.warn({ err: String(e) }, 'befriend failed'))
    },
  })

  const requireAuth = async (req: FastifyRequest, reply: FastifyReply) => {
    const h = req.headers.authorization
    const id = h?.startsWith('Bearer ') ? await tokens.verify(h.slice(7)) : null
    if (!id) return reply.code(401).send({ error: 'unauthorized' })
    req.playerId = id
  }

  app.get('/healthz', async () => ({ ok: true, time: new Date().toISOString(), rooms: rooms.size }))
  const devShutdown = deps.devShutdown
  if (devShutdown) {
    app.post('/__dev/shutdown', async (req, reply) => {
      if (req.socket.remoteAddress !== '127.0.0.1' && req.socket.remoteAddress !== '::1' && req.socket.remoteAddress !== '::ffff:127.0.0.1') return reply.code(404).send()
      devShutdown()
      return { ok: true }
    })
  }

  app.post('/v1/auth/guest', { config: { rateLimit: { max: deps.guestPerMinute ?? 20, timeWindow: '1 minute' } } }, async () => {
    const code = newRecoveryCode()
    const [row] = await db.insert(players).values({ recoveryHash: hashRecoveryCode(code, cfg.jwtSecret), friendCode: randomCode(6) }).returning({ id: players.id })
    return { playerId: row!.id, token: await tokens.sign(row!.id), recoveryCode: code }
  })

  app.post(
    '/v1/auth/recover',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } }, schema: { body: z.object({ code: z.string().min(12).max(20) }) } },
    async (req, reply) => {
      const [row] = await db.select({ id: players.id }).from(players).where(eq(players.recoveryHash, hashRecoveryCode(req.body.code, cfg.jwtSecret))).limit(1)
      if (!row) return reply.code(404).send({ error: 'unknown recovery code' })
      return { playerId: row.id, token: await tokens.sign(row.id) }
    },
  )

  app.get('/v1/me', { preHandler: requireAuth }, async (req, reply) => {
    const [row] = await db.select().from(players).where(eq(players.id, req.playerId)).limit(1)
    if (!row) return reply.code(401).send({ error: 'unknown player' })
    return { playerId: row.id, name: row.name, friendCode: row.friendCode ?? (await assignFriendCode(db, row.id)), version: row.saveVersion, save: row.save }
  })

  app.get('/v1/friends', { preHandler: requireAuth }, async req => {
    const rows = await db
      .select({ playerId: players.id, name: players.name, friendCode: players.friendCode })
      .from(friendships)
      .innerJoin(players, eq(players.id, friendships.friendId))
      .where(eq(friendships.playerId, req.playerId))
      .orderBy(desc(friendships.createdAt))
      .limit(200)
    return { friends: rows }
  })

  app.post('/v1/friends', { preHandler: requireAuth, config: { rateLimit: { max: 30, timeWindow: '1 minute' } }, schema: { body: z.object({ code: z.string().regex(/^[A-Za-z0-9]{6}$/) }) } }, async (req, reply) => {
    const [friend] = await db.select({ id: players.id }).from(players).where(eq(players.friendCode, req.body.code.toUpperCase())).limit(1)
    if (!friend) return reply.code(404).send({ error: 'unknown code' })
    if (friend.id === req.playerId) return reply.code(400).send({ error: 'own code' })
    await befriend(db, req.playerId, friend.id)
    return { ok: true }
  })

  app.put('/v1/save', { preHandler: requireAuth, schema: { body: SaveBody } }, async (req, reply) => {
    const { baseVersion, save } = req.body
    const updated = await db
      .update(players)
      .set({ save, name: cleanName(save.name), saveVersion: baseVersion + 1, updatedAt: new Date() })
      .where(and(eq(players.id, req.playerId), eq(players.saveVersion, baseVersion)))
      .returning({ version: players.saveVersion })
    if (updated.length) return { version: updated[0]!.version }
    const [row] = await db.select().from(players).where(eq(players.id, req.playerId)).limit(1)
    if (!row) return reply.code(401).send({ error: 'unknown player' })
    return reply.code(409).send({ error: 'stale save', version: row.saveVersion, save: row.save })
  })

  const key = cfg.openaiKey
  const director = deps.director ?? (key ? (m: MomentInput, model: string) => directSpirit(key, model, m) : null)
  const moderator = deps.moderator ?? (key ? (t: string) => moderate(key, t) : async () => true)
  const dayStart = () => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d }

  app.post('/v1/spirit/moment', { preHandler: requireAuth, config: { rateLimit: { max: 20, timeWindow: '1 minute' } }, schema: { body: MomentBody } }, async req => {
    if (!director) return { line: null, reason: 'ai-disabled' }
    const since = dayStart()
    const [mine] = await db.select({ n: sql<number>`count(*)::int` }).from(aiCalls).where(and(eq(aiCalls.playerId, req.playerId), gte(aiCalls.createdAt, since)))
    if ((mine?.n ?? 0) >= (deps.perPlayerDaily ?? AI.perPlayerDaily)) return { line: null, reason: 'player-cap' }
    const [all] = await db.select({ micros: sql<number>`coalesce(sum(usd_micros),0)::int` }).from(aiCalls).where(gte(aiCalls.createdAt, since))
    if ((all?.micros ?? 0) / 1e6 >= AI.globalDailyUsd) return { line: null, reason: 'budget' }
    const input = req.body as MomentInput
    let r = await director(input, AI.primary)
    if (!r.line && !r.failure?.startsWith('network')) r = await director(input, AI.fallback)
    const safe = r.line ? await moderator(r.line.line) : false
    await db.insert(aiCalls).values({ playerId: req.playerId, kind: input.kind, model: r.model, inputTokens: r.inputTokens, outputTokens: r.outputTokens, usdMicros: Math.round(r.usd * 1e6), ok: r.line && safe ? 1 : 0 })
    req.log.info({ ai: { kind: input.kind, model: r.model, ms: Math.round(r.ms), usd: r.usd, failure: r.failure, safe } }, 'spirit moment')
    if (!r.line || !safe) return { line: null, reason: r.failure ?? 'moderation' }
    return { line: r.line.line, mood: r.line.mood, nudge: r.line.nudge, memory: r.line.memory }
  })

  await app.ready()
  return app
}

async function assignFriendCode(db: Db, id: string): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    const code = randomCode(6)
    try {
      await db.update(players).set({ friendCode: code }).where(eq(players.id, id))
      return code
    } catch (e) {
      const pgCode = (e as { code?: string; cause?: { code?: string } }).cause?.code ?? (e as { code?: string }).code
      if (pgCode !== '23505' || attempt >= 4) throw e
    }
  }
}

export async function befriend(db: Db, a: string, b: string): Promise<void> {
  await db.insert(friendships).values([{ playerId: a, friendId: b }, { playerId: b, friendId: a }]).onConflictDoNothing()
}
