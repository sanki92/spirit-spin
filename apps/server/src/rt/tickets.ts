import { createHmac } from 'node:crypto'
import type { Side } from '@spirit/core'

export function signTicket(secret: string, c: { m: string; s: Side; e: number }): string {
  const p = Buffer.from(JSON.stringify({ m: c.m, s: c.s, e: c.e })).toString('base64url')
  return `${p}.${createHmac('sha256', secret).update(p).digest('base64url')}`
}
