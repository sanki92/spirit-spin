import { readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { signTicket } from './tickets'

const GOLDEN = new URL('../../../../edge/internal/ticket/testdata/golden.json', import.meta.url)

describe('tickets', () => {
  it('signs a payload.hmac ticket the Go edge verifies (shared golden)', () => {
    const g = { secret: 'test-secret', m: 'ROOM1-ab', s: 1 as const, token: signTicket('test-secret', { m: 'ROOM1-ab', s: 1, e: 1900000000000 }) }
    if (process.env.UPDATE_GOLDEN) writeFileSync(GOLDEN, JSON.stringify(g))
    expect(g).toEqual(JSON.parse(readFileSync(GOLDEN, 'utf8')))
    expect(g.token.split('.')).toHaveLength(2)
  })
})
