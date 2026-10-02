import type { FinishKind } from './battle/types'
import type { BeastId } from './parts'
import type { BossId } from './tower'

export type Trait = 'trust' | 'respect' | 'courage' | 'pride' | 'curiosity' | 'calm'
export type Reply = 'celebrate' | 'humble' | 'push' | 'comfort' | 'analyze' | 'fireup'
export type Mood = 'neutral' | 'proud' | 'furious' | 'sad' | 'sulky' | 'joyful'

export interface Memory { at: string; text: string; importance: number; tags: string[] }
export interface BeastState {
  id: BeastId
  trust: number
  respect: number
  courage: number
  pride: number
  curiosity: number
  calm: number
  battles: number
  awakened: string | null
  counters: { comebacks: number; spiritFinishes: number; bossWins: number; wins: number }
  memories: Memory[]
  daily: { date: string; deltas: Partial<Record<Trait, number>> }
}

export interface BattleSummary {
  won: boolean
  comeback: boolean
  finishes: FinishKind[]
  perfectRips: number
  overspins: number
  spiritCalls: number
  aggression: number
  boss: BossId | null
  opponent: string
}

export interface Change { trait: Trait; delta: number; reason: string }

const BASE: Record<BeastId, Pick<BeastState, 'courage' | 'pride' | 'curiosity' | 'calm'>> = {
  voltfang: { courage: 4, pride: 2, curiosity: 1, calm: -3 },
  aegiron: { courage: 0, pride: 1, curiosity: -2, calm: 4 },
  nagara: { courage: -1, pride: 0, curiosity: 3, calm: 3 },
  agnyx: { courage: 2, pride: 4, curiosity: 0, calm: -1 },
}

export const FORMS: Record<BeastId, { a: string; b: string; traitA: Trait; traitB: Trait }> = {
  voltfang: { a: 'storm', b: 'phantom', traitA: 'courage', traitB: 'calm' },
  aegiron: { a: 'titan', b: 'sage', traitA: 'pride', traitB: 'calm' },
  nagara: { a: 'tide', b: 'eclipse', traitA: 'courage', traitB: 'curiosity' },
  agnyx: { a: 'solar', b: 'inferno', traitA: 'pride', traitB: 'courage' },
}

const DAILY_CAP = 3
const MAX_MEMORIES = 50
export const HESITATE_BELOW = 25
export const AWAKEN = { trust: 60, respect: 60, battles: 12 } as const

export function newBeast(id: BeastId, starter: boolean): BeastState {
  return {
    id, trust: starter ? 35 : 10, respect: 20, ...BASE[id], battles: 0, awakened: null,
    counters: { comebacks: 0, spiritFinishes: 0, bossWins: 0, wins: 0 }, memories: [], daily: { date: '', deltas: {} },
  }
}

export function hesitates(b: BeastState): boolean {
  return b.trust < HESITATE_BELOW
}

function bump(b: BeastState, trait: Trait, delta: number, reason: string, date: string, changes: Change[]): void {
  if (b.daily.date !== date) b.daily = { date, deltas: {} }
  const used = b.daily.deltas[trait] ?? 0
  const allowed = delta > 0 ? Math.min(delta, DAILY_CAP - used) : Math.max(delta, -DAILY_CAP - used)
  if (allowed === 0) return
  b.daily.deltas[trait] = used + allowed
  const range = trait === 'trust' || trait === 'respect' ? [0, 100] : [-10, 10]
  const before = b[trait]
  b[trait] = Math.max(range[0] as number, Math.min(range[1] as number, before + allowed))
  if (b[trait] !== before) changes.push({ trait, delta: b[trait] - before, reason })
}

function remember(b: BeastState, m: Memory): void {
  b.memories = [...b.memories, m].sort((x, y) => y.importance - x.importance || (x.at < y.at ? 1 : -1)).slice(0, MAX_MEMORIES)
}

function clone(b: BeastState): BeastState {
  return { ...b, counters: { ...b.counters }, memories: [...b.memories], daily: { date: b.daily.date, deltas: { ...b.daily.deltas } } }
}

export function applyBattle(prev: BeastState, s: BattleSummary, date: string): { beast: BeastState; changes: Change[] } {
  const b = clone(prev)
  const changes: Change[] = []
  b.battles++
  bump(b, 'trust', 1, 'You battled together', date, changes)
  if (s.won) {
    b.counters.wins++
    bump(b, 'respect', 1, `You beat ${s.opponent}`, date, changes)
  }
  if (s.won && s.comeback) {
    b.counters.comebacks++
    bump(b, 'respect', 2, 'You came back from 3 points down', date, changes)
    bump(b, 'courage', 1, 'You never gave up', date, changes)
    remember(b, { at: date, text: `Came back from 3 points down to beat ${s.opponent}`, importance: 5, tags: ['comeback'] })
  }
  if (s.finishes.includes('spirit')) {
    b.counters.spiritFinishes++
    bump(b, 'pride', 1, 'You finished a round together with a Spirit Finish', date, changes)
  }
  if (s.won && s.boss) {
    b.counters.bossWins++
    bump(b, 'respect', 2, `You defeated ${s.opponent}`, date, changes)
    remember(b, { at: date, text: `Defeated ${s.opponent} in the Spirit Tower`, importance: 4, tags: ['boss', s.boss] })
  }
  if (s.perfectRips >= 2) bump(b, 'pride', 1, 'Your rips were PERFECT', date, changes)
  if (s.aggression >= 0.6) bump(b, 'courage', 1, 'You fought aggressively', date, changes)
  if (s.aggression <= 0.25) bump(b, 'calm', 1, 'You fought with patience', date, changes)
  if (s.overspins >= 2) bump(b, 'calm', -1, 'You overspun your launches', date, changes)
  if (!s.won) remember(b, { at: date, text: `Lost to ${s.opponent}`, importance: s.boss ? 3 : 1, tags: ['loss'] })
  return { beast: b, changes }
}

const REPLY_EFFECTS: Record<Reply, [Trait, number, string][]> = {
  celebrate: [['trust', 2, 'You celebrated together'], ['pride', 1, 'You celebrated together']],
  humble: [['respect', 1, 'You stayed humble'], ['calm', 1, 'You stayed humble']],
  push: [['respect', 1, 'You pushed for more'], ['courage', 1, 'You pushed for more']],
  comfort: [['trust', 3, 'You comforted your beast'], ['calm', 1, 'You comforted your beast']],
  analyze: [['curiosity', 2, 'You studied the loss together'], ['respect', 1, 'You studied the loss together']],
  fireup: [['courage', 2, 'You fired each other up'], ['pride', 1, 'You fired each other up']],
}

export function applyReply(prev: BeastState, reply: Reply, date: string): { beast: BeastState; changes: Change[] } {
  const b = clone(prev)
  const changes: Change[] = []
  for (const [t, d, why] of REPLY_EFFECTS[reply]) bump(b, t, d, why, date, changes)
  return { beast: b, changes }
}

export function applyNudges(prev: BeastState, nudges: Partial<Record<Exclude<Trait, 'trust' | 'respect'>, -1 | 0 | 1>>, reason: string, date: string): { beast: BeastState; changes: Change[] } {
  const b = clone(prev)
  const changes: Change[] = []
  for (const [t, d] of Object.entries(nudges) as [Trait, number][]) if (d === 1 || d === -1) bump(b, t, d, reason, date, changes)
  return { beast: b, changes }
}

export function awakeningReady(b: BeastState): boolean {
  if (b.awakened) return false
  const story = b.counters.comebacks >= 1 || b.counters.spiritFinishes >= 3 || b.counters.bossWins >= 2
  return b.trust >= AWAKEN.trust && b.respect >= AWAKEN.respect && b.battles >= AWAKEN.battles && story
}

export function awakenedForm(b: BeastState): string {
  const f = FORMS[b.id]
  return b[f.traitA] >= b[f.traitB] ? f.a : f.b
}

export function awakeningHints(b: BeastState): { text: string; done: boolean }[] {
  return [
    { text: `Trust reaches ${AWAKEN.trust}`, done: b.trust >= AWAKEN.trust },
    { text: `Respect reaches ${AWAKEN.respect}`, done: b.respect >= AWAKEN.respect },
    { text: `Battle together ${AWAKEN.battles} times`, done: b.battles >= AWAKEN.battles },
    { text: 'A turning point: win after being 3 points down, land 3 Spirit Finishes, or beat 2 Tower bosses', done: b.counters.comebacks >= 1 || b.counters.spiritFinishes >= 3 || b.counters.bossWins >= 2 },
  ]
}

export function moodAfter(s: BattleSummary, b: BeastState): Mood {
  if (s.won && s.comeback) return 'joyful'
  if (s.won) return b.pride >= 4 ? 'proud' : 'joyful'
  if (b.trust < HESITATE_BELOW) return 'sulky'
  return b.courage >= 3 ? 'furious' : 'sad'
}
