import { create } from 'zustand'

export interface Shortage { kind: 'coins' | 'shards'; need: number; item: string }

export const useShortage = create<{ open: Shortage | null; hide(): void }>(set => ({ open: null, hide: () => set({ open: null }) }))

export function needMore(kind: Shortage['kind'], need: number, item: string): void {
  useShortage.setState({ open: { kind, need: Math.max(1, Math.ceil(need)), item } })
}

export function canAfford(kind: Shortage['kind'], have: number, cost: number, item: string): boolean {
  if (have >= cost) return true
  needMore(kind, cost - have, item)
  return false
}
