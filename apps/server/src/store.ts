import { SKUS } from '@spirit/core'
import { and, eq } from 'drizzle-orm'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { entitlements, orders, type Db } from './db'

export interface Payments { provider: 'razorpay' | 'dev' | 'none'; keyId?: string | undefined; keySecret?: string | undefined; webhookSecret?: string | undefined }
type Auth = (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>

const hmac = (secret: string, data: string) => createHmac('sha256', secret).update(data).digest('hex')
const same = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export function registerStore(app: FastifyInstance, db: Db, requireAuth: Auth, pay: Payments) {
  const r = app.withTypeProvider<ZodTypeProvider>()

  const grant = async (orderId: string, paymentId: string) => {
    const [o] = await db.update(orders).set({ status: 'paid', paymentId }).where(eq(orders.providerOrderId, orderId)).returning()
    if (!o) return false
    const sku = SKUS[o.sku]
    if (sku) for (const item of sku.grants) await db.insert(entitlements).values({ playerId: o.playerId, item, source: o.id }).onConflictDoNothing()
    return true
  }

  r.get('/v1/entitlements', { preHandler: requireAuth }, async req => {
    const rows = await db.select({ item: entitlements.item }).from(entitlements).where(eq(entitlements.playerId, req.playerId))
    return { items: rows.map(x => x.item).sort(), provider: pay.provider }
  })

  r.post('/v1/store/order', { preHandler: requireAuth, config: { rateLimit: { max: 20, timeWindow: '1 minute' } }, schema: { body: z.object({ sku: z.string().max(40) }) } }, async (req, reply) => {
    const sku = SKUS[req.body.sku]
    if (!sku) return reply.code(400).send({ error: 'unknown item' })
    if (pay.provider === 'none' || !pay.keySecret) return reply.code(503).send({ error: 'payments unavailable' })
    let providerOrderId = `dev_${randomUUID()}`
    if (pay.provider === 'razorpay') {
      const res = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Basic ${Buffer.from(`${pay.keyId}:${pay.keySecret}`).toString('base64')}` },
        body: JSON.stringify({ amount: sku.paise, currency: 'INR', receipt: randomUUID().slice(0, 30), notes: { sku: sku.id } }),
        signal: AbortSignal.timeout(8000),
      }).catch(() => null)
      const data = res?.ok ? ((await res.json()) as { id?: string }) : null
      if (!data?.id) return reply.code(502).send({ error: 'payment provider unavailable' })
      providerOrderId = data.id
    }
    await db.insert(orders).values({ playerId: req.playerId, sku: sku.id, providerOrderId, amount: sku.paise })
    return { provider: pay.provider, keyId: pay.provider === 'razorpay' ? pay.keyId : null, orderId: providerOrderId, amount: sku.paise, currency: 'INR', name: sku.name }
  })

  r.post('/v1/store/verify', { preHandler: requireAuth, config: { rateLimit: { max: 30, timeWindow: '1 minute' } }, schema: { body: z.object({ orderId: z.string().max(80), paymentId: z.string().max(80), signature: z.string().max(200) }) } }, async (req, reply) => {
    const [o] = await db.select().from(orders).where(and(eq(orders.providerOrderId, req.body.orderId), eq(orders.playerId, req.playerId))).limit(1)
    if (!o) return reply.code(404).send({ error: 'unknown order' })
    if (!pay.keySecret || !same(hmac(pay.keySecret, `${req.body.orderId}|${req.body.paymentId}`), req.body.signature)) return reply.code(400).send({ error: 'invalid signature' })
    if (o.status !== 'paid') await grant(o.providerOrderId, req.body.paymentId)
    const rows = await db.select({ item: entitlements.item }).from(entitlements).where(eq(entitlements.playerId, req.playerId))
    return { items: rows.map(x => x.item).sort() }
  })

  if (pay.provider === 'dev') {
    r.post('/v1/store/dev/pay', { preHandler: requireAuth, schema: { body: z.object({ orderId: z.string().max(80) }) } }, async (req, reply) => {
      const [o] = await db.select().from(orders).where(and(eq(orders.providerOrderId, req.body.orderId), eq(orders.playerId, req.playerId))).limit(1)
      if (!o) return reply.code(404).send({ error: 'unknown order' })
      const paymentId = `devpay_${randomUUID().slice(0, 12)}`
      return { paymentId, signature: hmac(pay.keySecret!, `${o.providerOrderId}|${paymentId}`) }
    })
  }

  void app.register(async scope => {
    scope.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
      ;(req as FastifyRequest & { rawBody?: string }).rawBody = body as string
      try { done(null, JSON.parse(body as string)) } catch (e) { done(e as Error, undefined) }
    })
    scope.post('/v1/store/webhook', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (req, reply) => {
      const raw = (req as FastifyRequest & { rawBody?: string }).rawBody ?? ''
      const sig = req.headers['x-razorpay-signature']
      if (!pay.webhookSecret || typeof sig !== 'string' || !same(hmac(pay.webhookSecret, raw), sig)) return reply.code(400).send({ error: 'invalid signature' })
      const body = req.body as { event?: string; payload?: { payment?: { entity?: { id?: string; order_id?: string } } } }
      const p = body.payload?.payment?.entity
      if ((body.event === 'payment.captured' || body.event === 'order.paid') && p?.order_id && p.id) await grant(p.order_id, p.id)
      return { ok: true }
    })
  })
}
