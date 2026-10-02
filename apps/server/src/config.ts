import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { z } from 'zod'

const Env = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  DATABASE_URL: z.string().default('file://.data/pglite'),
  JWT_SECRET: z.string().min(32).optional(),
  CORS_ORIGINS: z.string().default('*'),
  OPENAI_API_KEY: z.string().optional(),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
})

export interface Config {
  databaseUrl: string
  jwtSecret: string
  corsOrigins: string[]
  logLevel: string
  openaiKey: string | null
  port?: number
  payments?: { provider: 'razorpay' | 'dev' | 'none'; keyId?: string | undefined; keySecret?: string | undefined; webhookSecret?: string | undefined }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const e = Env.parse(env)
  if (e.NODE_ENV === 'production' && !e.JWT_SECRET) throw new Error('JWT_SECRET is required in production')
  return {
    port: e.PORT,
    databaseUrl: e.DATABASE_URL,
    jwtSecret: e.JWT_SECRET ?? devSecret(),
    corsOrigins: e.CORS_ORIGINS.split(',').map(s => s.trim()),
    logLevel: e.LOG_LEVEL,
    openaiKey: e.OPENAI_API_KEY ?? null,
    payments: e.RAZORPAY_KEY_ID && e.RAZORPAY_KEY_SECRET
      ? { provider: 'razorpay', keyId: e.RAZORPAY_KEY_ID, keySecret: e.RAZORPAY_KEY_SECRET, webhookSecret: e.RAZORPAY_WEBHOOK_SECRET }
      : env.DEV_TOOLS === '1'
        ? { provider: 'dev', keySecret: `${e.JWT_SECRET ?? devSecret()}:dev-pay`, webhookSecret: `${e.JWT_SECRET ?? devSecret()}:dev-hook` }
        : { provider: 'none' },
  }
}

function devSecret(): string {
  const file = '.data/dev-jwt-secret'
  if (existsSync(file)) return readFileSync(file, 'utf8').trim()
  const secret = randomBytes(32).toString('hex')
  mkdirSync('.data', { recursive: true })
  writeFileSync(file, secret)
  return secret
}
