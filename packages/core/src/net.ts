import type { RoundOutcome, Side } from './battle'
import type { TopBuild } from './parts'
import type { MotionSample, RipResult } from './rip'
import type { TouchSample } from './rip-swipe'
import type { Timeline } from './netcode/replay'

export const NET = { swipeRpmCap: 13500, maxRooms: 5000, heartbeatMs: 10000, finishReplayMs: 3200, seatHoldMs: 15000, maxMessageBytes: 16384, maxMsgsPerSec: 120, maxBinPerSec: 200 } as const

export interface EdgeInfo { wt: string; ws: string; ticket: string; certHash: string | null }
export type RipView = Pick<RipResult, 'rpm' | 'quality' | 'overspin' | 'style' | 'bankDir' | 'timing' | 'straightness' | 'pullRatio'> & { ok: boolean; reason: string | null }

export type ClientMsg =
  | { k: 'hello'; token: string; name: string }
  | { k: 'create'; build: TopBuild }
  | { k: 'join'; code: string; build: TopBuild }
  | { k: 'rejoin'; code: string }
  | { k: 'ready' }
  | { k: 'rip'; round: number; motion?: MotionSample[]; swipe?: { points: TouchSample[]; h: number }; pull100: number }
  | { k: 'ping'; t: number }
  | { k: 'leave' }
  | { k: 'stadium' }
  | { k: 'watch'; code: string }

export type ServerMsg =
  | { k: 'welcome'; playerId: string }
  | { k: 'room'; code: string; side: Side }
  | { k: 'peer'; name: string; build: TopBuild; online: boolean }
  | { k: 'round'; round: number; launchAt: number }
  | { k: 'start'; round: number; seed: number; rips: [RipView, RipView]; t0: number; edge?: EdgeInfo }
  | { k: 'end'; round: number; outcome: RoundOutcome; scores: [number, number]; winner: Side | null }
  | { k: 'pong'; t: number; server: number }
  | { k: 'left'; reason: 'forfeit' | 'quit'; winner?: Side }
  | { k: 'error'; code: 'auth' | 'bad-message' | 'no-room' | 'full' | 'rate' }
  | { k: 'watching'; code: string }
  | { k: 'seats'; seats: ({ name: string; build: TopBuild; online: boolean } | null)[] }
  | { k: 'catchup'; round: number; tl: Timeline }
  | { k: 'resync'; round: number; tl: Timeline }
