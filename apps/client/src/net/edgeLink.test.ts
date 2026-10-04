import { describe, expect, it, vi } from 'vitest'
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
