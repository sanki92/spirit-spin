import type { RipFail, RipResult } from '@spirit/core'

export type PracticeStage = 'how' | 'when'
export const PRACTICE_TRIES = 3

const good = (r: RipResult | RipFail): boolean => r.ok && !r.overspin && (r.quality === 'GOOD' || r.quality === 'GREAT' || r.quality === 'PERFECT')

export function practiceVerdict(stage: PracticeStage, res: RipResult | RipFail, tries: number): 'advance' | 'retry' {
  if (tries >= PRACTICE_TRIES) return 'advance'
  if (stage === 'how') return good(res) ? 'advance' : 'retry'
  return res.ok ? 'advance' : 'retry'
}

export function timingNote(res: RipFail): { title: string; text: string } {
  if (res.reason === 'too-early') return { title: 'False start', text: 'Wait until LAUNCH appears, then flick.' }
  if (res.reason === 'too-late') return { title: 'Too late', text: 'Flick the moment LAUNCH appears.' }
  return { title: 'Flick on LAUNCH', text: 'Put your thumb down and flick it when LAUNCH appears.' }
}
