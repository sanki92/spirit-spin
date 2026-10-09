import type { RipFail, RipResult } from '@spirit/core'
import { coachTip } from './coach'

const coachTipFor = (res: RipResult | RipFail) => coachTip(res, true)

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

export function practiceTip(stage: PracticeStage, res: RipResult | RipFail, verdict: 'advance' | 'retry'): { title: string; text: string; now: true } {
  if (stage === 'how' && verdict === 'advance') return good(res) ? { title: 'Nice rip!', text: 'Now the timing: flick right when LAUNCH appears.', now: true } : { title: 'Let’s try the timing', text: 'Flick fast and straight right when LAUNCH appears.', now: true }
  if (stage === 'how') return { ...coachTipFor(res), now: true }
  return { ...timingNote(res as RipFail), now: true }
}

export const realRoundDone = (historyLen: number, realFrom: number): boolean => historyLen > realFrom
