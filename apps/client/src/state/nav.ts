import type { BossId, TopBuild } from '@spirit/core'
import { create } from 'zustand'
import type { MatchResult } from '../game/BattleController'
import type { Settlement } from './settle'

export type Route =
  | { k: 'splash' }
  | { k: 'age' }
  | { k: 'ready' }
  | { k: 'starter' }
  | { k: 'safety' }
  | { k: 'calibrate' }
  | { k: 'home' }
  | { k: 'garage' }
  | { k: 'tower' }
  | { k: 'collection' }
  | { k: 'shop' }
  | { k: 'journal' }
  | { k: 'settings' }
  | { k: 'battle'; opponent: TopBuild; floor: number | null; boss: BossId | null; opponentName: string }
  | { k: 'result'; result: MatchResult; settlement: Settlement; opponentName: string }
  | { k: 'awaken' }

interface Nav {
  stack: Route[]
  push(r: Route): void
  replace(r: Route): void
  back(): void
  reset(r: Route): void
}

export const useNav = create<Nav>(set => ({
  stack: [{ k: 'splash' }],
  push: r => set(s => ({ stack: [...s.stack, r] })),
  replace: r => set(s => ({ stack: [...s.stack.slice(0, -1), r] })),
  back: () => set(s => ({ stack: s.stack.length > 1 ? s.stack.slice(0, -1) : s.stack })),
  reset: r => set({ stack: [r] }),
}))

export const currentRoute = (s: Nav) => s.stack[s.stack.length - 1] as Route
