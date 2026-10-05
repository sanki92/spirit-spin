import { existsSync, renameSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres'
import { boolean, integer, jsonb, pgTable, real, text, timestamp, uuid, type PgDatabase, type PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import pg from 'pg'

export const players = pgTable('players', {
  id: uuid('id').primaryKey().defaultRandom(),
  recoveryHash: text('recovery_hash').notNull().unique(),
  name: text('name').notNull().default('Spinner'),
  friendCode: text('friend_code').unique(),
  username: text('username'),
  lastIp: text('last_ip'),
  lastCountry: text('last_country'),
  lastCity: text('last_city'),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  bannedAt: timestamp('banned_at', { withTimezone: true }),
  banReason: text('ban_reason'),
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

export const tournaments = pgTable('tournaments', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  ownerId: uuid('owner_id').notNull(),
  status: text('status').notNull().default('lobby'),
  format: text('format').notNull().default('rr'),
  roundsTotal: integer('rounds_total').notNull().default(0),
  currentRound: integer('current_round').notNull().default(0),
  roundHours: integer('round_hours').notNull().default(24),
  roundDeadline: timestamp('round_deadline', { withTimezone: true }),
  webhook: text('webhook'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const tournamentEntries = pgTable('tournament_entries', {
  tournamentId: uuid('tournament_id').notNull(),
  playerId: uuid('player_id').notNull(),
  points: integer('points').notNull().default(0),
  wins: integer('wins').notNull().default(0),
  losses: integer('losses').notNull().default(0),
  scoreFor: integer('score_for').notNull().default(0),
  scoreAgainst: integer('score_against').notNull().default(0),
  bye: boolean('bye').notNull().default(false),
  pool: text('pool'),
})

export const tournamentPairings = pgTable('tournament_pairings', {
  id: uuid('id').primaryKey().defaultRandom(),
  tournamentId: uuid('tournament_id').notNull(),
  round: integer('round').notNull(),
  a: uuid('a').notNull(),
  b: uuid('b'),
  winner: uuid('winner'),
  scores: jsonb('scores').$type<[number, number] | null>(),
  resolvedBy: text('resolved_by'),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
})

export const orders = pgTable('orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  playerId: uuid('player_id').notNull(),
  sku: text('sku').notNull(),
  providerOrderId: text('provider_order_id').notNull().unique(),
  paymentId: text('payment_id'),
  amount: integer('amount').notNull(),
  status: text('status').notNull().default('created'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const entitlements = pgTable('entitlements', {
  playerId: uuid('player_id').notNull(),
  item: text('item').notNull(),
  source: text('source'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const playerIps = pgTable('player_ips', {
  playerId: uuid('player_id').notNull(),
  ip: text('ip').notNull(),
  country: text('country'),
  city: text('city'),
  firstSeen: timestamp('first_seen', { withTimezone: true }).notNull().defaultNow(),
  lastSeen: timestamp('last_seen', { withTimezone: true }).notNull().defaultNow(),
})

export const ipBans = pgTable('ip_bans', {
  ip: text('ip').primaryKey(),
  reason: text('reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const liveMatches = pgTable('live_matches', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull(),
  aId: uuid('a_id').notNull(),
  bId: uuid('b_id').notNull(),
  aName: text('a_name').notNull(),
  bName: text('b_name').notNull(),
  aBeast: text('a_beast'),
  bBeast: text('b_beast'),
  scores: jsonb('scores').$type<[number, number]>().notNull(),
  winner: integer('winner'),
  rounds: jsonb('rounds').$type<unknown[]>().notNull().default([]),
  startedAt: timestamp('started_at', { withTimezone: true }),
  endedAt: timestamp('ended_at', { withTimezone: true }).notNull().defaultNow(),
})

export const adminLog = pgTable('admin_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  action: text('action').notNull(),
  target: text('target'),
  detail: jsonb('detail').$type<Record<string, unknown> | null>(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
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
  `CREATE TABLE IF NOT EXISTS tournaments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text NOT NULL UNIQUE,
    name text NOT NULL,
    owner_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    status text NOT NULL DEFAULT 'lobby',
    format text NOT NULL DEFAULT 'rr',
    rounds_total integer NOT NULL DEFAULT 0,
    current_round integer NOT NULL DEFAULT 0,
    round_hours integer NOT NULL DEFAULT 24,
    round_deadline timestamptz,
    webhook text,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS tournament_entries (
    tournament_id uuid NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    points integer NOT NULL DEFAULT 0,
    wins integer NOT NULL DEFAULT 0,
    losses integer NOT NULL DEFAULT 0,
    score_for integer NOT NULL DEFAULT 0,
    score_against integer NOT NULL DEFAULT 0,
    bye boolean NOT NULL DEFAULT false,
    PRIMARY KEY (tournament_id, player_id)
  );
  CREATE TABLE IF NOT EXISTS tournament_pairings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id uuid NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    round integer NOT NULL,
    a uuid NOT NULL,
    b uuid,
    winner uuid,
    scores jsonb,
    resolved_by text,
    resolved_at timestamptz
  );
  CREATE INDEX IF NOT EXISTS tournament_pairings_t ON tournament_pairings (tournament_id, round);
  CREATE INDEX IF NOT EXISTS tournaments_running ON tournaments (status, round_deadline)`,
  `ALTER TABLE tournament_entries ADD COLUMN IF NOT EXISTS pool text;
  CREATE INDEX IF NOT EXISTS ghost_matches_ref ON ghost_matches (ref_id)`,
  `CREATE TABLE IF NOT EXISTS orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    sku text NOT NULL,
    provider_order_id text NOT NULL UNIQUE,
    payment_id text,
    amount integer NOT NULL,
    status text NOT NULL DEFAULT 'created',
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS entitlements (
    player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    item text NOT NULL,
    source text,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (player_id, item)
  )`,
  `DELETE FROM ghost_matches a USING ghost_matches b WHERE a.ref_id IS NOT NULL AND a.ref_id = b.ref_id AND a.player_id = b.player_id AND (a.created_at, a.id) > (b.created_at, b.id);
  CREATE UNIQUE INDEX IF NOT EXISTS ghost_matches_one_attempt ON ghost_matches (ref_id, player_id) WHERE ref_id IS NOT NULL`,
  `ALTER TABLE players ADD COLUMN IF NOT EXISTS username text;
  CREATE UNIQUE INDEX IF NOT EXISTS players_username_key ON players (lower(username))`,
  `ALTER TABLE players ADD COLUMN IF NOT EXISTS last_ip text;
  ALTER TABLE players ADD COLUMN IF NOT EXISTS last_country text;
  ALTER TABLE players ADD COLUMN IF NOT EXISTS last_city text;
  ALTER TABLE players ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;
  ALTER TABLE players ADD COLUMN IF NOT EXISTS banned_at timestamptz;
  ALTER TABLE players ADD COLUMN IF NOT EXISTS ban_reason text;
  CREATE TABLE IF NOT EXISTS player_ips (
    player_id uuid NOT NULL,
    ip text NOT NULL,
    country text,
    city text,
    first_seen timestamptz NOT NULL DEFAULT now(),
    last_seen timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (player_id, ip)
  );
  CREATE INDEX IF NOT EXISTS player_ips_ip ON player_ips (ip);
  CREATE TABLE IF NOT EXISTS ip_bans (
    ip text PRIMARY KEY,
    reason text,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS live_matches (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text NOT NULL,
    a_id uuid NOT NULL,
    b_id uuid NOT NULL,
    a_name text NOT NULL,
    b_name text NOT NULL,
    a_beast text,
    b_beast text,
    scores jsonb NOT NULL,
    winner integer,
    rounds jsonb NOT NULL DEFAULT '[]',
    started_at timestamptz,
    ended_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS live_matches_a ON live_matches (a_id, ended_at DESC);
  CREATE INDEX IF NOT EXISTS live_matches_b ON live_matches (b_id, ended_at DESC);
  CREATE TABLE IF NOT EXISTS admin_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    action text NOT NULL,
    target text,
    detail jsonb,
    at timestamptz NOT NULL DEFAULT now()
  )`,
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
