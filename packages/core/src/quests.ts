import type { MatchSummary } from './progression'
import { createRng, rngNext } from './rng'

export type QuestId = 'play3' | 'win2' | 'perfect3' | 'ringout1' | 'shatter1' | 'spirit2' | 'spiritFinish1' | 'comeback1'

export interface Quest { id: QuestId; text: string; target: number; progress: number; reward: number }

export const QUEST_POOL: readonly Omit<Quest, 'progress'>[] = [
  { id: 'play3', text: 'Play 3 battles', target: 3, reward: 60 },
  { id: 'win2', text: 'Win 2 battles', target: 2, reward: 80 },
  { id: 'perfect3', text: 'Land 3 PERFECT rips', target: 3, reward: 100 },
  { id: 'ringout1', text: 'Win a round by Ring Out', target: 1, reward: 70 },
  { id: 'shatter1', text: 'Win a round by Shatter Finish', target: 1, reward: 90 },
  { id: 'spirit2', text: 'Summon your beast 2 times', target: 2, reward: 70 },
  { id: 'spiritFinish1', text: 'Win a round by Spirit Finish', target: 1, reward: 110 },
  { id: 'comeback1', text: 'Win after being 3 points down', target: 1, reward: 150 },
]

export function dailyQuests(dateKey: string): Quest[] {
  let seed = 2166136261
  for (let i = 0; i < dateKey.length; i++) seed = Math.imul(seed ^ dateKey.charCodeAt(i), 16777619) >>> 0
  const rng = createRng(seed)
  const pool = [...QUEST_POOL]
  const out: Quest[] = []
  while (out.length < 3) {
    const q = pool.splice(Math.floor(rngNext(rng) * pool.length), 1)[0] as Omit<Quest, 'progress'>
    out.push({ ...q, progress: 0 })
  }
  return out
}

function gain(id: QuestId, m: MatchSummary): number {
  switch (id) {
    case 'play3': return 1
    case 'win2': return m.won ? 1 : 0
    case 'perfect3': return m.perfectRips
    case 'ringout1': return m.finishes.includes('ringout') ? 1 : 0
    case 'shatter1': return m.finishes.includes('shatter') ? 1 : 0
    case 'spirit2': return m.spiritCalls
    case 'spiritFinish1': return m.finishes.includes('spirit') ? 1 : 0
    case 'comeback1': return m.comeback && m.won ? 1 : 0
  }
}

export function applyQuestProgress(quests: readonly Quest[], m: MatchSummary): Quest[] {
  return quests.map(q => ({ ...q, progress: Math.min(q.target, q.progress + gain(q.id, m)) }))
}
