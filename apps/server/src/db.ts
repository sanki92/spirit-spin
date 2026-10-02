import { existsSync, renameSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres'
import { integer, jsonb, pgTable, real, text, timestamp, uuid, type PgDatabase, type PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import pg from 'pg'

export const players = pgTable('players', {
  id: uuid('id').primaryKey().defaultRandom(),
  recoveryHash: text('recovery_hash').notNull().unique(),
  name: text('name').notNull().default('Spinner'),
  friendCode: text('friend_code').unique(),
  save: jsonb('save').$type<Record<string, unknown>>().notNull().default({}),
  saveVersion: integer('save_version').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const friendships = pgTable('friendships', {
  playerId: uuid('player_id').notNull(),
  friendId: uuid('friend_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const playerStats = pgTable('player_stats', {
  playerId: uuid('player_id').primaryKey(),
  rating: integer('rating').notNull().default(1000),
  ratingSwipe: integer('rating_swipe').notNull().default(1000),
  rips: jsonb('rips').$type<unknown[]>().notNull().default([]),
  aggression: real('aggression').notNull().default(0.5),
  deck: jsonb('deck').$type<unknown[] | null>(),
  rankedPlayed: integer('ranked_played').notNull().default(0),
  rankedWon: integer('ranked_won').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const ghostMatches = pgTable('ghost_matches', {
  id: uuid('id').primaryKey().defaultRandom(),
  playerId: uuid('player_id').notNull(),
  opponentId: uuid('opponent_id'),
  kind: text('kind').notNull(),
  pool: text('pool').notNull().default('motion'),
  refId: uuid('ref_id'),
  seed: integer('seed').notNull(),
  spec: jsonb('spec').$type<Record<string, unknown>>().notNull(),
  status: text('status').notNull().default('issued'),
  result: jsonb('result').$type<Record<string, unknown> | null>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
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
  `ALTER TABLE players ADD COLUMN IF NOT EXISTS friend_code text UNIQUE;
  CREATE TABLE IF NOT EXISTS friendships (
    player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    friend_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (player_id, friend_id)
  )`,
  `CREATE TABLE IF NOT EXISTS player_stats (
    player_id uuid PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
    rating integer NOT NULL DEFAULT 1000,
    rating_swipe integer NOT NULL DEFAULT 1000,
    rips jsonb NOT NULL DEFAULT '[]'::jsonb,
    aggression real NOT NULL DEFAULT 0.5,
    deck jsonb,
    ranked_played integer NOT NULL DEFAULT 0,
    ranked_won integer NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS player_stats_rating ON player_stats (rating);
  CREATE TABLE IF NOT EXISTS ghost_matches (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    opponent_id uuid REFERENCES players(id) ON DELETE SET NULL,
    kind text NOT NULL,
    pool text NOT NULL DEFAULT 'motion',
    ref_id uuid,
    seed integer NOT NULL,
    spec jsonb NOT NULL,
    status text NOT NULL DEFAULT 'issued',
    result jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS ghost_matches_player ON ghost_matches (player_id, created_at)`,
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
    if (process.env.DEV_TOOLS !== '1' || !existsSync(dir)) throw e
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
