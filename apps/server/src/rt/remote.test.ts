import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { REMOTE, RemoteRound, type EdgeApi } from './edge'
import { battle } from './testkit'

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

function silentEdge() {
  const opened: number[] = []
  const edge: EdgeApi = {
    cfg: { grpc: 'x', secret: 's', wt: '', ws: '' },
    createMatch: async () => ({ certHash: '' }),
    startRound: async () => Date.now(),
    endRound: async () => ({}),
    endMatch: async () => undefined,
    stream: (_id, _r, after) => { opened.push(after); return () => undefined },
  }
  return { edge, opened }
}

describe('remote round', () => {
  it('a stream that goes silent after t0 is resubscribed, and an edge that stays silent is reported lost', async () => {
    const { edge, opened } = silentEdge()
    let lost = 0
    const t0 = Date.now() + 1000
    const rr = new RemoteRound(1, battle(), t0, edge, 'M', { watch: () => undefined, resync: () => undefined, end: () => undefined, lost: () => lost++, heard: () => undefined, log: () => undefined })
    await vi.advanceTimersByTimeAsync(2500)
    expect(opened).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1500)
    expect(opened.length).toBeGreaterThan(1)
    await vi.advanceTimersByTimeAsync((REMOTE.stallMs + REMOTE.retryMs + 1000) * (REMOTE.retries + 2))
    expect(lost).toBe(1)
    rr.stop()
  })
})

