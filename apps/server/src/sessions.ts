import { randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { players, type Db } from './db'

export type SessionCheck = 'ok' | 'signed-out' | 'expired' | 'unknown'

export class Sessions {
  private cache = new Map<string, string | null>()
  private kickers = new Set<(playerId: string) => void>()

  constructor(private db: Db) {}

  onKick(fn: (playerId: string) => void): void {
    this.kickers.add(fn)
  }

  private async current(id: string): Promise<string | null | undefined> {
    if (this.cache.has(id)) return this.cache.get(id)
    const [row] = await this.db.select({ sid: players.sessionId }).from(players).where(eq(players.id, id)).limit(1)
    if (!row) return undefined
    if (this.cache.size > 100_000) this.cache.clear()
    this.cache.set(id, row.sid)
    return row.sid
  }

  async check(token: { id: string; sid: string | null; expired: boolean }): Promise<SessionCheck> {
    const cur = await this.current(token.id)
    if (cur === undefined) return 'unknown'
    if (cur !== null && token.sid !== cur) return 'signed-out'
    return token.expired ? 'expired' : 'ok'
  }

  async sid(id: string): Promise<string | null> {
    return (await this.current(id)) ?? null
  }

  async rotate(id: string): Promise<string> {
    const sid = randomBytes(12).toString('base64url')
    await this.db.update(players).set({ sessionId: sid }).where(eq(players.id, id))
    this.cache.set(id, sid)
    for (const k of this.kickers) k(id)
    return sid
  }

  remember(id: string, sid: string): void {
    this.cache.set(id, sid)
  }
}
