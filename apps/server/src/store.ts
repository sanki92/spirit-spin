import { SKUS } from '@spirit/core'
import { and, eq } from 'drizzle-orm'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { entitlements, players, type Db } from './db'

type Auth = (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>

export function registerStore(app: FastifyInstance, db: Db, requireAuth: Auth) {
  const r = app.withTypeProvider<ZodTypeProvider>()
  const owned = async (playerId: string) => (await db.select({ item: entitlements.item }).from(entitlements).where(eq(entitlements.playerId, playerId))).map(x => x.item).sort()

  r.get('/v1/entitlements', { preHandler: requireAuth }, async req => ({ items: await owned(req.playerId) }))

  r.post('/v1/store/buy', { preHandler: requireAuth, config: { rateLimit: { max: 20, timeWindow: '1 minute' } }, schema: { body: z.object({ sku: z.string().max(40) }) } }, async (req, reply) => {
    const sku = SKUS[req.body.sku]
    if (!sku) return reply.code(400).send({ error: 'unknown item' })
    const have = await owned(req.playerId)
    if (sku.grants.every(g => have.includes(g))) return reply.code(409).send({ error: 'owned', items: have })
    const [p] = await db.select({ save: players.save, v: players.saveVersion }).from(players).where(eq(players.id, req.playerId)).limit(1)
    if (!p) return reply.code(404).send({ error: 'no such player' })
    const coins = Math.max(0, Math.floor(Number((p.save as { coins?: unknown }).coins) || 0))
    if (coins < sku.coins) return reply.code(402).send({ error: 'not enough coins', need: sku.coins - coins, coins })
    const next = { ...p.save, coins: coins - sku.coins }
    const done = await db.update(players).set({ save: next, saveVersion: p.v + 1, updatedAt: new Date() }).where(and(eq(players.id, req.playerId), eq(players.saveVersion, p.v))).returning({ v: players.saveVersion })
    if (!done.length) return reply.code(409).send({ error: 'retry' })
    for (const item of sku.grants) await db.insert(entitlements).values({ playerId: req.playerId, item, source: `coins:${sku.coins}` }).onConflictDoNothing()
    return { items: await owned(req.playerId), coins: next.coins, version: done[0]!.v }
  })
}
