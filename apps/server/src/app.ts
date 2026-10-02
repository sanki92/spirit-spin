import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import { and, eq } from 'drizzle-orm'
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify'
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { hashRecoveryCode, newRecoveryCode, Tokens } from './auth'
import type { Config } from './config'
import { openDb, players } from './db'

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

export async function buildApp(cfg: Config) {
  const app = Fastify({ logger: cfg.logLevel === 'silent' ? false : { level: cfg.logLevel }, bodyLimit: 256 * 1024, trustProxy: true }).withTypeProvider<ZodTypeProvider>()
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  const { db, close } = await openDb(cfg.databaseUrl)
  const tokens = new Tokens(cfg.jwtSecret)
  app.addHook('onClose', close)
  await app.register(cors, { origin: cfg.corsOrigins.includes('*') ? true : cfg.corsOrigins })
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' })

  const requireAuth = async (req: FastifyRequest, reply: FastifyReply) => {
    const h = req.headers.authorization
    const id = h?.startsWith('Bearer ') ? await tokens.verify(h.slice(7)) : null
    if (!id) return reply.code(401).send({ error: 'unauthorized' })
    req.playerId = id
  }

  app.get('/healthz', async () => ({ ok: true, time: new Date().toISOString() }))

  app.post('/v1/auth/guest', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async () => {
    const code = newRecoveryCode()
    const [row] = await db.insert(players).values({ recoveryHash: hashRecoveryCode(code, cfg.jwtSecret) }).returning({ id: players.id })
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
    return { playerId: row.id, name: row.name, version: row.saveVersion, save: row.save }
  })

  app.put('/v1/save', { preHandler: requireAuth, schema: { body: SaveBody } }, async (req, reply) => {
    const { baseVersion, save } = req.body
    const updated = await db
      .update(players)
      .set({ save, saveVersion: baseVersion + 1, updatedAt: new Date() })
      .where(and(eq(players.id, req.playerId), eq(players.saveVersion, baseVersion)))
      .returning({ version: players.saveVersion })
    if (updated.length) return { version: updated[0]!.version }
    const [row] = await db.select().from(players).where(eq(players.id, req.playerId)).limit(1)
    if (!row) return reply.code(401).send({ error: 'unknown player' })
    return reply.code(409).send({ error: 'stale save', version: row.saveVersion, save: row.save })
  })

  await app.ready()
  return app
}
