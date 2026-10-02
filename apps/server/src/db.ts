import { existsSync, renameSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres'
import { integer, jsonb, pgTable, text, timestamp, uuid, type PgDatabase, type PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import pg from 'pg'

export const players = pgTable('players', {
  id: uuid('id').primaryKey().defaultRandom(),
  recoveryHash: text('recovery_hash').notNull().unique(),
  name: text('name').notNull().default('Spinner'),
  save: jsonb('save').$type<Record<string, unknown>>().notNull().default({}),
  saveVersion: integer('save_version').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const aiCalls = pgTable('ai_calls', {
  id: uuid('id').primaryKey().defaultRandom(),
  playerId: uuid('player_id').notNull(),
  kind: text('kind').notNull(),
  model: text('model').notNull(),
  inputTokens: integer('input_tokens').notNull(),
  outputTokens: integer('output_tokens').notNull(),
  usdMicros: integer('usd_micros').notNull(),
  ok: integer('ok').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

const MIGRATIONS: string[] = [
  `CREATE TABLE IF NOT EXISTS players (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    recovery_hash text NOT NULL UNIQUE,
    name text NOT NULL DEFAULT 'Spinner',
    save jsonb NOT NULL DEFAULT '{}'::jsonb,
    save_version integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS ai_calls (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id uuid NOT NULL,
    kind text NOT NULL,
    model text NOT NULL,
    input_tokens integer NOT NULL,
    output_tokens integer NOT NULL,
    usd_micros integer NOT NULL,
    ok integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS ai_calls_player_day ON ai_calls (player_id, created_at)`,
]

export type Db = PgDatabase<PgQueryResultHKT>

export async function openDb(url: string): Promise<{ db: Db; close: () => Promise<void> }> {
  if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
    const pool = new pg.Pool({ connectionString: url, max: 10 })
    const db = drizzlePg(pool) as unknown as Db
    await migrate(db)
    return { db, close: () => pool.end() }
  }
  if (url === 'memory://') return openPglite(new PGlite())
  const dir = url.replace(/^file:\/\//, '')
  try {
    return await openPglite(new PGlite(dir))
  } catch (e) {
    if (process.env.NODE_ENV === 'production' || !existsSync(dir)) throw e
    const aside = `${dir}.corrupt-${new Date().toISOString().replace(/[:.]/g, '-')}`
    renameSync(dir, aside)
    console.warn(`[db] dev PGlite at ${dir} would not open (${String(e).slice(0, 120)}); moved to ${aside} and starting fresh`)
    return openPglite(new PGlite(dir))
  }
}

async function openPglite(client: PGlite): Promise<{ db: Db; close: () => Promise<void> }> {
  const db = drizzlePglite(client) as unknown as Db
  await migrate(db)
  return { db, close: () => client.close() }
}

async function migrate(db: Db): Promise<void> {
  await db.execute(sql`CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`)
  const done = await db.execute(sql`SELECT version FROM schema_migrations`)
  const applied = new Set(((done as unknown as { rows: { version: number }[] }).rows).map(r => Number(r.version)))
  for (let i = 0; i < MIGRATIONS.length; i++) {
    if (applied.has(i + 1)) continue
    for (const stmt of (MIGRATIONS[i] as string).split(';').map(s => s.trim()).filter(Boolean)) await db.execute(sql.raw(stmt))
    await db.execute(sql`INSERT INTO schema_migrations (version) VALUES (${i + 1})`)
  }
}
