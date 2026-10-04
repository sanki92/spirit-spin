import { describe, expect, it, vi } from 'vitest'
import { encode } from '@spirit/core'
import { EDGE, EdgeLink, edgeUrls, hexBytes } from './edgeLink'

vi.mock('../telemetry', () => ({ log: () => undefined }))

describe('edge link', () => {
  const info = { wt: 'https://{host}:4433/wt', ws: '/edge/ws', ticket: 'a.b+c', certHash: 'ff00' }
  it('resolves urls against the page and escapes the ticket', () => {
    expect(edgeUrls(info, { hostname: '172.20.10.3', protocol: 'https:', host: '172.20.10.3:5173' })).toEqual({ wt: 'https://172.20.10.3:4433/wt?t=a.b%2Bc', ws: 'wss://172.20.10.3:5173/edge/ws?t=a.b%2Bc' })
    expect(edgeUrls({ ...info, ws: 'wss://edge.example/ws' }, { hostname: 'x', protocol: 'https:', host: 'x' }).ws).toBe('wss://edge.example/ws?t=a.b%2Bc')
    expect(edgeUrls(info, { hostname: 'localhost', protocol: 'http:', host: 'localhost:5173' }).ws).toBe('ws://localhost:5173/edge/ws?t=a.b%2Bc')
  })
  it('decodes the certificate hash', () => {
    expect([...hexBytes('ff00a1')]).toEqual([255, 0, 161])
    expect([...hexBytes('')]).toEqual([])
  })
})

describe('edge link reconnects', () => {
  it('gives up after repeated failed reconnects instead of retrying forever', async () => {
    vi.useFakeTimers()
    let attempts = 0
    class FailWS {
      binaryType = 'arraybuffer'
      readyState = 3
      onopen: (() => void) | null = null
      onerror: (() => void) | null = null
      onclose: (() => void) | null = null
      onmessage: ((e: MessageEvent) => void) | null = null
      constructor() { attempts++; setTimeout(() => { this.onerror?.(); this.onclose?.() }, 1) }
      send() {}
      close() {}
    }
    const link = new EdgeLink({ wt: 'https://{host}:4433/wt', ws: '/edge/ws', ticket: 't', certHash: null }, { WT: undefined, WS: FailWS as unknown as typeof WebSocket, location: { hostname: 'h', protocol: 'https:', host: 'h' } })
    link.start()
    for (let i = 0; i < 40; i++) await vi.advanceTimersByTimeAsync(5000)
    expect(attempts).toBe(1 + EDGE.maxRetries)
    link.close()
    vi.useRealTimers()
  })
})

describe('edge link refresh', () => {
  it('a link that gave up reopens with the fresh ticket from the next start', async () => {
    vi.useFakeTimers()
    const urls: string[] = []
    let ok = false
    class WS {
      binaryType = 'arraybuffer'
      readyState = 0
      onopen: (() => void) | null = null
      onerror: (() => void) | null = null
      onclose: (() => void) | null = null
      onmessage: ((e: MessageEvent) => void) | null = null
      constructor(url: string) {
        urls.push(url)
        setTimeout(() => { if (ok) { this.readyState = 1; this.onopen?.() } else { this.onerror?.(); this.onclose?.() } }, 1)
      }
      send() {}
      close() {}
    }
    const loc = { hostname: 'h', protocol: 'https:', host: 'h' }
    const link = new EdgeLink({ wt: 'https://{host}:4433/wt', ws: '/edge/ws', ticket: 'old', certHash: null }, { WT: undefined, WS: WS as unknown as typeof WebSocket, location: loc })
    link.start()
    for (let i = 0; i < 40; i++) await vi.advanceTimersByTimeAsync(5000)
    const gaveUpAt = urls.length
    ok = true
    link.refresh({ wt: 'https://{host}:4433/wt', ws: '/edge/ws', ticket: 'new', certHash: null })
    await vi.advanceTimersByTimeAsync(100)
    expect(urls.length).toBe(gaveUpAt + 1)
    expect(urls.at(-1)).toContain('t=new')
    expect(link.kind).toBe('ws')
    link.close()
    vi.useRealTimers()
  })
})

describe('edge link transport choice', () => {
  it('a WebTransport attempt that fails while the network is down is retried once the network is back', async () => {
    vi.useFakeTimers()
    let up = false
    const wtUrls: string[] = []
    class FakeWT {
      ready: Promise<void>
      closed: Promise<void>
      datagrams = { writable: { getWriter: () => ({ write: async () => undefined }) }, readable: { getReader: () => ({ read: () => new Promise(() => undefined) }) } }
      constructor(url: string) {
        wtUrls.push(url)
        this.ready = up ? Promise.resolve() : Promise.reject(new Error('net down'))
        this.closed = new Promise(() => undefined)
        this.ready.catch(() => undefined)
      }
      close() {}
    }
    class DownWS {
      binaryType = 'arraybuffer'
      readyState = 0
      onopen: (() => void) | null = null
      onerror: (() => void) | null = null
      onclose: (() => void) | null = null
      onmessage: ((e: MessageEvent) => void) | null = null
      constructor() { setTimeout(() => { this.onerror?.(); this.onclose?.() }, 1) }
      send() {}
      close() {}
    }
    const link = new EdgeLink({ wt: 'https://{host}:4433/wt', ws: '/edge/ws', ticket: 't', certHash: null }, { WT: FakeWT as unknown as typeof WebTransport, WS: DownWS as unknown as typeof WebSocket, location: { hostname: 'h', protocol: 'https:', host: 'h' } })
    link.start()
    await vi.advanceTimersByTimeAsync(100)
    up = true
    await vi.advanceTimersByTimeAsync(5000)
    expect(wtUrls.length).toBeGreaterThan(1)
    expect(link.kind).toBe('wt')
    link.close()
    vi.useRealTimers()
  })
})

describe('edge link review fixes', () => {
  const loc = { hostname: 'h', protocol: 'https:', host: 'h' }
  const info = (ticket = 't') => ({ wt: 'https://{host}:4433/wt', ws: '/edge/ws', ticket, certHash: null })
  type Behaviour = 'fail' | 'open' | 'bounce'
  const fakeWS = (mode: () => Behaviour, failMs = 1) => {
    const made: { ws: InstanceType<ReturnType<typeof make>> }[] = []
    const make = () => class {
      binaryType = 'arraybuffer'
      readyState = 0
      onopen: (() => void) | null = null
      onerror: (() => void) | null = null
      onclose: (() => void) | null = null
      onmessage: ((e: MessageEvent) => void) | null = null
      constructor() {
        made.push({ ws: this })
        const m = mode()
        setTimeout(() => {
          if (m === 'fail') { this.onerror?.(); this.onclose?.(); return }
          this.readyState = 1
          this.onopen?.()
          if (m === 'bounce') setTimeout(() => { this.readyState = 3; this.onclose?.() }, 5)
        }, m === 'fail' ? failMs : 1)
      }
      send() {}
      close() {}
    }
    return { WS: make(), made }
  }

  it('an edge that accepts and then drops at once is not retried forever', async () => {
    vi.useFakeTimers()
    const { WS, made } = fakeWS(() => 'bounce')
    const link = new EdgeLink(info(), { WT: undefined, WS: WS as unknown as typeof WebSocket, location: loc })
    link.start()
    for (let i = 0; i < 60; i++) await vi.advanceTimersByTimeAsync(5000)
    expect(made.length).toBeLessThanOrEqual(1 + EDGE.maxRetries)
    link.close()
    vi.useRealTimers()
  })

  it('a fresh start that lands during the last allowed attempt still gets a full retry budget', async () => {
    vi.useFakeTimers()
    let ok = false
    const { WS, made } = fakeWS(() => (ok ? 'open' : 'fail'), 1000)
    const link = new EdgeLink(info('old'), { WT: undefined, WS: WS as unknown as typeof WebSocket, location: loc })
    link.start()
    for (let i = 0; i < 400 && made.length < 1 + EDGE.maxRetries; i++) await vi.advanceTimersByTimeAsync(50)
    expect(made.length).toBe(1 + EDGE.maxRetries)
    link.refresh(info('new'))
    ok = true
    for (let i = 0; i < 10; i++) await vi.advanceTimersByTimeAsync(1000)
    expect(link.kind).toBe('ws')
    link.close()
    vi.useRealTimers()
  })

  it('the clock offset comes from the fastest of the first pongs, not the first one', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
    const { WS, made } = fakeWS(() => 'open')
    const link = new EdgeLink(info(), { WT: undefined, WS: WS as unknown as typeof WebSocket, location: loc })
    link.start()
    await vi.advanceTimersByTimeAsync(5)
    const ws = made[0]!.ws
    const pong = (rtt: number, server: number) => ws.onmessage?.({ data: encode({ op: 'pong', t: performance.now() - rtt, server }).buffer } as MessageEvent)
    pong(300, 2_000_000)
    pong(20, 3_000_000)
    pong(120, 2_500_000)
    expect(Math.abs(link.serverNow() - (3_000_000 + 10))).toBeLessThan(2)
    link.close()
    vi.useRealTimers()
  })
})

describe('edge link races WebTransport against the WebSocket', () => {
  const loc = { hostname: 'h', protocol: 'https:', host: 'h' }
  const info = { wt: 'https://{host}:4433/wt', ws: '/edge/ws', ticket: 't', certHash: 'ab' }
  const fakeWT = (mode: 'hang' | 'reject' | 'open', openMs = 1) => {
    const made: { closed: boolean }[] = []
    class WT {
      ready: Promise<void>
      closed: Promise<void>
      datagrams = { writable: { getWriter: () => ({ write: async () => undefined }) }, readable: { getReader: () => ({ read: () => new Promise(() => undefined) }) } }
      rec = { closed: false }
      constructor() {
        made.push(this.rec)
        this.ready = mode === 'hang' ? new Promise(() => undefined) : mode === 'reject' ? new Promise((_, rej) => setTimeout(() => rej(new Error('WebTransportError')), 1)) : new Promise(r => setTimeout(r, openMs))
        this.closed = mode === 'reject' ? new Promise((_, rej) => setTimeout(() => rej(new Error('WebTransportError')), 2)) : new Promise(() => undefined)
      }
      close() { this.rec.closed = true }
    }
    return { WT: WT as unknown as typeof WebTransport, made }
  }
  class OpenWS {
    binaryType = 'arraybuffer'
    readyState = 0
    onopen: (() => void) | null = null
    onerror: (() => void) | null = null
    onclose: (() => void) | null = null
    onmessage: ((e: MessageEvent) => void) | null = null
    constructor() { setTimeout(() => { this.readyState = 1; this.onopen?.() }, 5) }
    send() {}
    close() {}
  }

  it('a WebTransport handshake that never completes (iOS with a dev cert) falls back after the head start, not the full timeout', async () => {
    vi.useFakeTimers()
    const { WT, made } = fakeWT('hang')
    const link = new EdgeLink(info, { WT, WS: OpenWS as unknown as typeof WebSocket, location: loc })
    link.start()
    await vi.advanceTimersByTimeAsync(EDGE.wtHeadStartMs + 50)
    expect(link.kind).toBe('ws')
    await vi.advanceTimersByTimeAsync(EDGE.wtTimeoutMs)
    expect(made[0]!.closed).toBe(true)
    link.close()
    vi.useRealTimers()
  })

  it('a rejected WebTransport leaves no unhandled rejection and the WebSocket takes over', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
    const seen: unknown[] = []
    const onRej = (e: unknown) => seen.push(e)
    process.on('unhandledRejection', onRej)
    const { WT } = fakeWT('reject')
    const link = new EdgeLink(info, { WT, WS: OpenWS as unknown as typeof WebSocket, location: loc })
    link.start()
    await vi.advanceTimersByTimeAsync(EDGE.wtHeadStartMs + 50)
    await new Promise(r => setImmediate(r))
    process.off('unhandledRejection', onRej)
    expect(link.kind).toBe('ws')
    expect(seen).toEqual([])
    link.close()
    vi.useRealTimers()
  })

  it('a WebTransport that answers within the head start wins and no WebSocket is opened', async () => {
    vi.useFakeTimers()
    let wsMade = 0
    class CountWS extends OpenWS { constructor() { super(); wsMade++ } }
    const { WT } = fakeWT('open', 20)
    const link = new EdgeLink(info, { WT, WS: CountWS as unknown as typeof WebSocket, location: loc })
    link.start()
    await vi.advanceTimersByTimeAsync(EDGE.wtHeadStartMs + 200)
    expect(link.kind).toBe('wt')
    expect(wsMade).toBe(0)
    link.close()
    vi.useRealTimers()
  })
})

describe('edge link race leaves exactly one transport', () => {
  const loc = { hostname: 'h', protocol: 'https:', host: 'h' }
  const info = { wt: 'https://{host}:4433/wt', ws: '/edge/ws', ticket: 't', certHash: 'ab' }

  it('a WebTransport that wins after the head start aborts the WebSocket still connecting, so the edge never sees both', async () => {
    vi.useFakeTimers()
    const wsState: { closedBeforeOpen: boolean; opened: boolean }[] = []
    class SlowWS {
      binaryType = 'arraybuffer'
      readyState = 0
      onopen: (() => void) | null = null
      onerror: (() => void) | null = null
      onclose: (() => void) | null = null
      onmessage: ((e: MessageEvent) => void) | null = null
      rec = { closedBeforeOpen: false, opened: false }
      constructor() { wsState.push(this.rec); setTimeout(() => { if (this.rec.closedBeforeOpen) return; this.rec.opened = true; this.readyState = 1; this.onopen?.() }, 400) }
      send() {}
      close() { if (!this.rec.opened) this.rec.closedBeforeOpen = true; this.readyState = 3 }
    }
    let wtClosed = false
    class WT {
      ready = new Promise<void>(r => setTimeout(r, EDGE.wtHeadStartMs + 100))
      closed = new Promise<void>(() => undefined)
      datagrams = { writable: { getWriter: () => ({ write: async () => undefined }) }, readable: { getReader: () => ({ read: () => new Promise(() => undefined) }) } }
      close() { wtClosed = true }
    }
    const link = new EdgeLink(info, { WT: WT as unknown as typeof WebTransport, WS: SlowWS as unknown as typeof WebSocket, location: loc })
    link.start()
    await vi.advanceTimersByTimeAsync(EDGE.wtHeadStartMs + 1000)
    expect(link.kind).toBe('wt')
    expect(wtClosed).toBe(false)
    expect(wsState).toHaveLength(1)
    expect(wsState[0]).toEqual({ closedBeforeOpen: true, opened: false })
    link.close()
    vi.useRealTimers()
  })

  it('a WebSocket that wins closes the WebTransport still handshaking at once', async () => {
    vi.useFakeTimers()
    let wtClosed = false
    class HangWT {
      ready = new Promise<void>(() => undefined)
      closed = new Promise<void>(() => undefined)
      datagrams = { writable: { getWriter: () => ({ write: async () => undefined }) }, readable: { getReader: () => ({ read: () => new Promise(() => undefined) }) } }
      close() { wtClosed = true }
    }
    class FastWS {
      binaryType = 'arraybuffer'
      readyState = 0
      onopen: (() => void) | null = null
      onerror: (() => void) | null = null
      onclose: (() => void) | null = null
      onmessage: ((e: MessageEvent) => void) | null = null
      constructor() { setTimeout(() => { this.readyState = 1; this.onopen?.() }, 5) }
      send() {}
      close() {}
    }
    const link = new EdgeLink(info, { WT: HangWT as unknown as typeof WebTransport, WS: FastWS as unknown as typeof WebSocket, location: loc })
    link.start()
    await vi.advanceTimersByTimeAsync(EDGE.wtHeadStartMs + 20)
    expect(link.kind).toBe('ws')
    expect(wtClosed).toBe(true)
    link.close()
    vi.useRealTimers()
  })

  it('a stale race callback never closes the transport of a newer connection', async () => {
    vi.useFakeTimers()
    const socks: { closed: boolean }[] = []
    class LateWS {
      binaryType = 'arraybuffer'
      readyState = 0
      onopen: (() => void) | null = null
      onerror: (() => void) | null = null
      onclose: (() => void) | null = null
      onmessage: ((e: MessageEvent) => void) | null = null
      rec = { closed: false }
      constructor() {
        socks.push(this.rec)
        const first = socks.length === 1
        setTimeout(() => { if (this.readyState === 0) { this.readyState = 1; this.onopen?.() } }, first ? 5000 : 5)
      }
      send() {}
      close() {
        if (this.rec.closed) return
        this.rec.closed = true
        const pending = this.readyState === 0
        this.readyState = 3
        setTimeout(() => { if (pending) this.onerror?.(); this.onclose?.() }, pending ? 1000 : 0)
      }
    }
    let wts = 0
    let dropFirst: () => void = () => undefined
    class OnceWT {
      ready: Promise<void>
      closed: Promise<void>
      datagrams = { writable: { getWriter: () => ({ write: async () => undefined }) }, readable: { getReader: () => ({ read: () => new Promise(() => undefined) }) } }
      constructor() {
        wts++
        this.ready = wts === 1 ? new Promise(r => setTimeout(r, EDGE.wtHeadStartMs + 50)) : Promise.reject(new Error('down'))
        this.ready.catch(() => undefined)
        this.closed = new Promise(r => { dropFirst = r })
      }
      close() {}
    }
    const link = new EdgeLink(info, { WT: OnceWT as unknown as typeof WebTransport, WS: LateWS as unknown as typeof WebSocket, location: loc })
    link.start()
    await vi.advanceTimersByTimeAsync(EDGE.wtHeadStartMs + 100)
    expect(link.kind).toBe('wt')
    dropFirst()
    await vi.advanceTimersByTimeAsync(400)
    expect(link.kind).toBe('ws')
    expect(socks).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(6000)
    expect(socks[1]!.closed).toBe(false)
    link.close()
    vi.useRealTimers()
  })

})
