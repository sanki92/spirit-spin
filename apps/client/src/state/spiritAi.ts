import type { BattleSummary, BeastState, Mood, Reply } from '@spirit/core'
import { log } from '../telemetry'
import { authHeader, reauth } from './sync'

export interface AiLine { line: string; mood: Mood; nudge: { trait: 'none' | 'courage' | 'pride' | 'curiosity' | 'calm'; delta: -1 | 0 | 1 }; memory: { text: string; importance: number } | null }

export async function spiritMoment(kind: 'post' | 'reply' | 'greet' | 'awaken', beast: BeastState, battle: BattleSummary | null, reply: Reply | null, retry = true): Promise<AiLine | null> {
  const t0 = performance.now()
  try {
    const res = await fetch('/v1/spirit/moment', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...authHeader() },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({
        kind,
        beast: { id: beast.id, trust: beast.trust, respect: beast.respect, courage: beast.courage, pride: beast.pride, curiosity: beast.curiosity, calm: beast.calm, battles: beast.battles, awakened: beast.awakened, memories: beast.memories.slice(0, 10).map(m => ({ text: m.text.slice(0, 120), importance: m.importance })) },
        battle: battle ? { ...battle, opponent: battle.opponent.slice(0, 40), aggression: Math.max(0, Math.min(1, battle.aggression)) } : null,
        reply,
      }),
    })
    if (res.status === 401 && retry) {
      if (await reauth()) return spiritMoment(kind, beast, battle, reply, false)
      return null
    }
    const data = (await res.json()) as Partial<AiLine> & { line: string | null; reason?: string }
    log('spirit.ai', { kind, ms: Math.round(performance.now() - t0), status: res.status, ok: !!data.line, reason: data.reason ?? null, line: data.line ?? null })
    return data.line ? (data as AiLine) : null
  } catch (e) {
    log('spirit.ai', { kind, ms: Math.round(performance.now() - t0), error: String(e).slice(0, 100) })
    return null
  }
}
