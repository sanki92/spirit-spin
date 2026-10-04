/** Match scoring: first to 4 points; capped rounds with sudden death on a tie (spec §5.2). */
import type { RoundOutcome } from './battle/types'

export const POINTS_TO_WIN = 4
export const MAX_ROUNDS = 12
export const HARD_ROUND_CAP = MAX_ROUNDS + 8

export interface MatchState {
  round: number // 1-based round about to be played
  scores: [number, number]
  history: RoundOutcome[]
  winner: 0 | 1 | null
  suddenDeath: boolean // tied at the round cap: next decisive round wins
}

export function newMatch(): MatchState {
  return { round: 1, scores: [0, 0], history: [], winner: null, suddenDeath: false }
}

export function applyRound(m: MatchState, o: RoundOutcome): MatchState {
  if (m.winner !== null) throw new Error('match already decided')
  const scores: [number, number] = [m.scores[0], m.scores[1]]
  if (o.winner !== null) scores[o.winner] += o.points
  const history = [...m.history, o]
  let winner: 0 | 1 | null = null
  if (scores[0] >= POINTS_TO_WIN || scores[1] >= POINTS_TO_WIN || (m.suddenDeath && o.winner !== null)) {
    winner = scores[0] > scores[1] ? 0 : 1
  } else if ((history.length >= MAX_ROUNDS && scores[0] !== scores[1]) || history.length >= HARD_ROUND_CAP) {
    winner = scores[0] >= scores[1] ? 0 : 1
  }
  const suddenDeath = winner === null && history.length >= MAX_ROUNDS
  return { round: m.round + 1, scores, history, winner, suddenDeath }
}

export const replaysFinish = (o: RoundOutcome, matchOver: boolean): boolean => o.finish === 'ringout' || o.finish === 'shatter' || o.finish === 'spirit' || (o.finish === 'spin' && matchOver)
