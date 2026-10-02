import { createHash, randomInt } from 'node:crypto'
import { jwtVerify, SignJWT } from 'jose'

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

  sign(playerId: string): Promise<string> {
    return new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setSubject(playerId).setIssuedAt().setExpirationTime('30d').sign(this.key)
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
export const cleanName = (s: unknown) => (typeof s === 'string' ? s.replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 16) : '') || 'Spinner'
