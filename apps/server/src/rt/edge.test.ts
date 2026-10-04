import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { EdgeClient, RemoteRound } from './edge'
import { battle } from './testkit'

const SECRET = 'edge-test-secret-0123456789'
const port = 14535
let proc: ChildProcess | undefined
let edge: EdgeClient

beforeAll(async () => {
  const bin = join(tmpdir(), `spirit-edge-test${process.platform === 'win32' ? '.exe' : ''}`)
  execFileSync('go', ['build', '-o', bin, './cmd/edge'], { cwd: fileURLToPath(new URL('../../../../edge', import.meta.url)), stdio: 'inherit' })
  proc = spawn(bin, ['-wt', '127.0.0.1:14533', '-ws', '127.0.0.1:14534', '-grpc', `127.0.0.1:${port}`, '-metrics', '127.0.0.1:14536'], { env: { ...process.env, RT_EDGE_SECRET: SECRET }, stdio: 'ignore' })
  edge = new EdgeClient({ grpc: `127.0.0.1:${port}`, secret: SECRET, wt: 'https://{host}:14533/wt', ws: '/edge/ws' })
  for (let i = 0; i < 120; i++) {
    try { await edge.createMatch('probe'); return } catch { await new Promise(r => setTimeout(r, 250)) }
  }
  throw new Error('edge did not start')
}, 120000)
afterAll(() => { edge?.close(); proc?.kill() })

describe('edge over gRPC', () => {
  it('runs a round: t0, streamed frames verified by a RemoteRound, end with stats', async () => {
    const { certHash } = await edge.createMatch('M1')
    expect(certHash).toMatch(/^[0-9a-f]{64}$/)
    const t0 = await edge.startRound('M1', 1, 0)
    expect(t0).toBeGreaterThan(Date.now() - 5000)
    const watched: Uint8Array[] = []
    let ended = 0
    const rr = new RemoteRound(1, battle(), t0, edge, 'M1', { watch: b => watched.push(b), resync: () => undefined, end: () => ended++, lost: () => undefined, log: () => undefined })
    await new Promise(r => setTimeout(r, 1500))
    expect(rr.ver.frame).toBeGreaterThan(30)
    expect(watched.length).toBeGreaterThan(0)
    rr.stop()
    const stats = await edge.endRound('M1', 1)
    expect(Number(stats.frames)).toBeGreaterThan(30)
    await edge.endMatch('M1')
    expect(ended).toBe(0)
  })

  it('a dropped stream resubscribes from the verified frame and stays contiguous', async () => {
    await edge.createMatch('M2')
    const t0 = await edge.startRound('M2', 1, 0)
    const rr = new RemoteRound(1, battle(), t0, edge, 'M2', { watch: () => undefined, resync: () => undefined, end: () => undefined, lost: () => undefined, log: () => undefined })
    await new Promise(r => setTimeout(r, 600))
    ;(rr as unknown as { cancel: () => void }).cancel()
    ;(rr as unknown as { subscribe: () => void }).subscribe()
    const before = rr.ver.frame
    await new Promise(r => setTimeout(r, 600))
    expect(rr.ver.frame).toBeGreaterThan(before + 20)
    rr.stop()
    await edge.endMatch('M2')
  })

  it('rejects calls with the wrong secret', async () => {
    const bad = new EdgeClient({ grpc: `127.0.0.1:${port}`, secret: 'wrong', wt: '', ws: '' })
    await expect(bad.createMatch('X')).rejects.toThrow()
    bad.close()
  })
})
