import { create } from 'zustand'

export interface Invite { from: { playerId: string; name: string }; code: string; at: number }

interface Profile {
  loaded: boolean
  username: string | null
  friendCode: string | null
  invites: Invite[]
  banned: string | null
  set(p: Partial<Omit<Profile, 'set'>>): void
}

export const useProfile = create<Profile>(set => ({
  loaded: false,
  username: null,
  friendCode: null,
  invites: [],
  banned: null,
  set: p => set(p),
}))
