import { randomBytes } from 'node:crypto'
import { z } from 'zod'

const Env = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  DATABASE_URL: z.string().default('file://.data/pglite'),
  JWT_SECRET: z.string().min(32).optional(),
  CORS_ORIGINS: z.string().default('*'),
  OPENAI_API_KEY: z.string().optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
})

export interface Config {
  databaseUrl: string
  jwtSecret: string
  corsOrigins: string[]
  logLevel: string
  openaiKey: string | null
  port?: number
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const e = Env.parse(env)
  if (e.NODE_ENV === 'production' && !e.JWT_SECRET) throw new Error('JWT_SECRET is required in production')
  return {
    port: e.PORT,
    databaseUrl: e.DATABASE_URL,
    jwtSecret: e.JWT_SECRET ?? randomBytes(32).toString('hex'),
    corsOrigins: e.CORS_ORIGINS.split(',').map(s => s.trim()),
    logLevel: e.LOG_LEVEL,
    openaiKey: e.OPENAI_API_KEY ?? null,
  }
}
