import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { z } from 'zod'
import type { EdgeConfig } from './rt/edge'

const Env = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  DATABASE_URL: z.string().default('file://.data/pglite'),
  JWT_SECRET: z.string().min(32).optional(),
  CORS_ORIGINS: z.string().optional(),
  RECOVERY_PEPPER: z.string().min(32).optional(),
  TRUST_PROXY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  STATIC_DIR: z.string().optional(),
  ASSET_ARCHIVE_DIR: z.string().optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  RT_EDGE_GRPC: z.string().optional(),
  RT_EDGE_SECRET: z.string().optional(),
  RT_EDGE_WT: z.string().optional(),
  RT_EDGE_WS: z.string().optional(),
  NET_DASH_KEY: z.string().min(16).optional(),
  LOG_DIR: z.string().default('.data/logs'),
  DISCORD_WEBHOOK_URL: z.string().url().optional(),
  ADMIN_USER: z.string().min(3).optional(),
  ADMIN_PASSWORD_HASH: z.string().optional(),
  COMPETITIVE: z.enum(['0', '1']).optional(),
})

export interface Config {
  databaseUrl: string
  jwtSecret: string
  corsOrigins: string[]
  logLevel: string
  openaiKey: string | null
  port?: number
  recoveryPepper?: string | undefined
  trustProxy?: string | boolean | undefined
  staticDir?: string | undefined
  assetArchiveDir?: string | undefined
  edge?: EdgeConfig | null
  netDashKey?: string | undefined
  logDir?: string | undefined
  discordWebhook?: string | undefined
  admin?: { user: string; passwordHash: string } | null
  competitive?: boolean
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const e = Env.parse(env)
  if (e.RT_EDGE_GRPC && (e.RT_EDGE_SECRET ?? '').length < 16) throw new Error('RT_EDGE_SECRET (16+ chars) is required when RT_EDGE_GRPC is set')
  if (e.NODE_ENV === 'production') {
    if (!e.JWT_SECRET) throw new Error('JWT_SECRET is required in production')
    if (!e.RECOVERY_PEPPER) throw new Error('RECOVERY_PEPPER is required in production')
    if (!e.CORS_ORIGINS) throw new Error('CORS_ORIGINS is required in production')
    if (env.DEV_TOOLS === '1') throw new Error('DEV_TOOLS must not be enabled in production')
    for (const k of ['JWT_SECRET', 'RECOVERY_PEPPER'] as const) if (/replace|change-?me|example/i.test(e[k] ?? '')) throw new Error(`${k} is still a placeholder`)
  }
  return {
    port: e.PORT,
    databaseUrl: e.DATABASE_URL,
    jwtSecret: e.JWT_SECRET ?? devSecret(),
    corsOrigins: (e.CORS_ORIGINS ?? '*').split(',').map(s => s.trim()),
    recoveryPepper: e.RECOVERY_PEPPER,
    trustProxy: e.TRUST_PROXY === 'false' ? false : e.TRUST_PROXY ?? 'loopback',
    logLevel: e.LOG_LEVEL,
    openaiKey: e.OPENAI_API_KEY ?? null,
    staticDir: e.STATIC_DIR,
    assetArchiveDir: e.ASSET_ARCHIVE_DIR,
    netDashKey: e.NET_DASH_KEY,
    logDir: e.LOG_DIR,
    discordWebhook: e.DISCORD_WEBHOOK_URL,
    competitive: e.COMPETITIVE === '1',
    admin: e.ADMIN_USER && e.ADMIN_PASSWORD_HASH ? { user: e.ADMIN_USER, passwordHash: e.ADMIN_PASSWORD_HASH } : null,
    edge: e.RT_EDGE_GRPC ? { grpc: e.RT_EDGE_GRPC, secret: e.RT_EDGE_SECRET!, wt: e.RT_EDGE_WT ?? 'https://{host}:4433/wt', ws: e.RT_EDGE_WS ?? '/edge/ws' } : null,
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
