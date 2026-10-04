export const USERNAME = { min: 3, max: 16 } as const

export type UsernameError = 'short' | 'long' | 'start' | 'chars' | 'blocked'

const RESERVED_PREFIX = ['admin', 'moderator', 'support', 'official', 'staff', 'system', 'spiritspin', 'developer']
const RESERVED = new Set(['mod', 'root', 'null', 'undefined', 'guest', 'spinner', 'spirit', 'owner', 'help'])
const OFFENSIVE = ['fuck', 'shit', 'bitch', 'cunt', 'nigg', 'fag', 'slut', 'whore', 'rape', 'nazi', 'pussy', 'bastard', 'dick', 'chutiya', 'madarchod', 'bhenchod', 'behenchod', 'randi', 'gandu', 'lund']
const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '9': 'g' }

export const usernameKey = (raw: string): string => raw.trim().toLowerCase()

export function usernameError(raw: string): UsernameError | null {
  const s = raw.trim()
  if (s.length < USERNAME.min) return 'short'
  if (s.length > USERNAME.max) return 'long'
  if (!/^[A-Za-z0-9_]+$/.test(s) || s.includes('__')) return 'chars'
  if (!/^[A-Za-z]/.test(s)) return 'start'
  const plain = s.toLowerCase().replace(/[0-9]/g, d => LEET[d] ?? d).replace(/_/g, '')
  const letters = s.toLowerCase().replace(/[^a-z]/g, '')
  if (RESERVED.has(letters) || RESERVED_PREFIX.some(p => letters.startsWith(p))) return 'blocked'
  if (OFFENSIVE.some(w => plain.includes(w))) return 'blocked'
  return null
}
