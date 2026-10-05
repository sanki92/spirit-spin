import { createHash, randomInt } from 'node:crypto'
import { errors, jwtVerify, SignJWT } from 'jose'

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function newRecoveryCode(): string {
  const part = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')
  return `${part()}-${part()}-${part()}`
}

export function normalizeRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/(.{4})(?=.)/g, '$1-')
}

export function hashRecoveryCode(code: string, pepper: string): string {
  return createHash('sha256').update(`${pepper}:${normalizeRecoveryCode(code)}`).digest('hex')
}

export class Tokens {
  private key: Uint8Array

  constructor(secret: string) {
    this.key = new TextEncoder().encode(secret)
  }

  sign(playerId: string, sid?: string | null): Promise<string> {
    return new SignJWT(sid ? { sid } : {}).setProtectedHeader({ alg: 'HS256' }).setSubject(playerId).setIssuedAt().setExpirationTime('30d').sign(this.key)
  }

  async inspect(token: string): Promise<{ id: string; sid: string | null; expired: boolean } | null> {
    const read = (p: { sub?: unknown; sid?: unknown }, expired: boolean) => (typeof p.sub === 'string' ? { id: p.sub, sid: typeof p.sid === 'string' ? p.sid : null, expired } : null)
    try {
      return read((await jwtVerify(token, this.key, { algorithms: ['HS256'] })).payload, false)
    } catch (e) {
      return e instanceof errors.JWTExpired ? read(e.payload, true) : null
    }
  }

  async verify(token: string): Promise<string | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, { algorithms: ['HS256'] })
      return typeof payload.sub === 'string' ? payload.sub : null
    } catch {
      return null
    }
  }
}

export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const randomCode = (n: number) => Array.from({ length: n }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('')
const RUDE_ANY = /(fuck|shit|bitch|cunt|pussy|nigg|faggot|whore|hitler|porn|bhosd|madarch|behench|chutiya)/i
const RUDE_WORD = /\b(dick|cock|fag|slut|rape|nazi|sex|kys|lund|gaand|randi|kill ?yourself)\b/i
export const cleanText = (s: unknown, max: number, fallback: string) => {
  const t = typeof s === 'string' ? s.replace(/[^\p{L}\p{N} '!?&._-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, max) : ''
  return t && !RUDE_ANY.test(t.replace(/[\s._-]/g, '')) && !RUDE_WORD.test(t) ? t : fallback
}
export const cleanName = (s: unknown) => cleanText(typeof s === 'string' ? s.replace(/['!?&.]/g, '') : s, 16, 'Spinner')
