import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { actionLog } from './actionlog'
import { buildApp } from './app'

const day = (ms: number) => new Date(ms).toISOString().slice(0, 10)

describe('action log', () => {
  it('keeps server events, drops request noise, and prunes files older than the window', () => {
    const dir = mkdtempSync(join(tmpdir(), 'alog-'))
    const now = Date.parse('2026-10-18T10:00:00Z')
    writeFileSync(join(dir, '2026-10-01.jsonl'), 'old\n')
    writeFileSync(join(dir, '2026-10-10.jsonl'), 'recent\n')
    const out = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const log = actionLog(dir, 14, () => now)
    log.server.write('{"msg":"incoming request","url":"/healthz"}\n')
    log.server.write('{"msg":"room.forfeit","reason":"quit"}\n')
    log.add({ src: 'client', type: 'nav' })
    out.mockRestore()
    const lines = readFileSync(join(dir, `${day(now)}.jsonl`), 'utf8').trim().split('\n')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toContain('room.forfeit')
    expect(JSON.parse(lines[1]!)).toMatchObject({ src: 'client', type: 'nav', time: now })
    expect(existsSync(join(dir, '2026-10-01.jsonl'))).toBe(false)
    expect(existsSync(join(dir, '2026-10-10.jsonl'))).toBe(true)
  })

  it('client batches land in the file tagged with the signed-in player', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'alog-'))
    const app = await buildApp({ databaseUrl: 'memory://', jwtSecret: 'test-secret-test-secret-test-secret-32', corsOrigins: ['*'], logLevel: 'silent', openaiKey: null, logDir: dir }, { guestPerMinute: 1000 })
    const g = (await app.inject({ method: 'POST', url: '/v1/auth/guest' })).json() as { token: string; playerId: string }
    const r = await app.inject({ method: 'POST', url: '/v1/client-log', headers: { authorization: `Bearer ${g.token}` }, payload: { s: 'abc123', v: '1.258', e: [{ t: 5, type: 'nav', data: { to: 'garage' } }, { t: 9, type: 'tap', data: { label: 'Save' } }] } })
    expect(r.statusCode).toBe(200)
    const anon = await app.inject({ method: 'POST', url: '/v1/client-log', payload: { s: 'zzz', e: [{ t: 1, type: 'boot' }] } })
    expect(anon.statusCode).toBe(200)
    await app.close()
    const rows = readFileSync(join(dir, `${day(Date.now())}.jsonl`), 'utf8').trim().split('\n').map(l => JSON.parse(l) as Record<string, unknown>).filter(x => x.src === 'client')
    expect(rows.map(x => x.type)).toEqual(['nav', 'tap', 'boot'])
    expect(rows[0]).toMatchObject({ pid: g.playerId, s: 'abc123', v: '1.258', data: '{"to":"garage"}' })
    expect(rows[2]).toMatchObject({ pid: null })
  }, 120_000)
})
