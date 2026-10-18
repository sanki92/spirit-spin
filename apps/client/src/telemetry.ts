type Entry = { t: number; s: string; type: string; data?: unknown }

const dev = import.meta.env.DEV
const session = Math.random().toString(36).slice(2, 8)
const t0 = performance.now()
let queue: Entry[] = []
let timer = 0
let auth: () => Record<string, string> = () => ({})

export function setLogAuth(fn: () => Record<string, string>): void {
  auth = fn
}

function flush(): void {
  if (!queue.length) return
  const batch = queue.slice(0, 60)
  queue = queue.slice(60)
  if (dev) {
    const body = JSON.stringify(batch)
    if (!navigator.sendBeacon?.('/__log', new Blob([body], { type: 'application/json' }))) void fetch('/__log', { method: 'POST', body, headers: { 'content-type': 'application/json' }, keepalive: true }).catch(() => undefined)
  } else {
    const body = JSON.stringify({ s: session, v: __BUILD__, e: batch.map(({ t, type, data }) => ({ t, type, data })) })
    void fetch('/v1/client-log', { method: 'POST', body, headers: { 'content-type': 'application/json', ...auth() }, keepalive: true }).catch(() => undefined)
  }
  if (queue.length) flush()
}

export function log(type: string, data?: unknown): void {
  if (queue.length >= 200) return
  queue.push({ t: Math.round(performance.now() - t0), s: session, type, data })
  if (queue.length >= 60) flush()
  else if (!timer) timer = window.setTimeout(() => { timer = 0; flush() }, dev ? 1500 : 5000)
}

let reported = 0

export function report(kind: string, data: Record<string, unknown>): void {
  if (import.meta.env.DEV || reported++ >= 30) return
  const body = JSON.stringify({ kind, msg: JSON.stringify(data).slice(0, 400) })
  void fetch('/v1/client-perf', { method: 'POST', body, headers: { 'content-type': 'application/json' }, keepalive: true }).catch(() => undefined)
}

export function installTelemetry(): void {
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { effectiveType?: string } }
  log('session', {
    ua: navigator.userAgent, w: innerWidth, h: innerHeight, dpr: devicePixelRatio, cores: navigator.hardwareConcurrency,
    mem: nav.deviceMemory ?? null, net: nav.connection?.effectiveType ?? null, standalone: matchMedia('(display-mode: standalone)').matches,
    secure: isSecureContext, motionApi: 'DeviceMotionEvent' in window, motionNeedsPermission: typeof (DeviceMotionEvent as unknown as { requestPermission?: unknown }).requestPermission === 'function',
  })
  addEventListener('error', e => log('error', { msg: e.message, src: e.filename, line: e.lineno, col: e.colno, stack: (e.error as Error | undefined)?.stack?.slice(0, 600) }))
  addEventListener('unhandledrejection', e => log('rejection', { reason: String((e.reason as Error)?.stack ?? e.reason).slice(0, 600) }))
  document.addEventListener('visibilitychange', () => { log('visibility', document.visibilityState); if (document.visibilityState === 'hidden') flush() })
  addEventListener('pageshow', e => log('pageshow', { persisted: e.persisted, vis: document.visibilityState }))
  addEventListener('focus', () => log('focus', document.visibilityState))
  addEventListener('blur', () => { log('blur', document.visibilityState); flush() })
  addEventListener('orientationchange', () => log('orientation', { w: innerWidth, h: innerHeight, angle: screen.orientation?.angle }))
  addEventListener('resize', () => log('resize', { w: innerWidth, h: innerHeight }))
  addEventListener('pointerdown', e => {
    const el = e.target as HTMLElement | null
    const label = el?.closest('button')?.textContent?.trim().slice(0, 40) ?? el?.className?.toString().slice(0, 40)
    log('tap', { x: Math.round(e.clientX), y: Math.round(e.clientY), label, type: e.pointerType })
  }, { passive: true, capture: true })
  addEventListener('pagehide', flush)
  addEventListener('online', () => log('online'))
  addEventListener('offline', () => log('offline'))
  const conn = (navigator as Navigator & { connection?: EventTarget & { type?: string; effectiveType?: string; rtt?: number; downlink?: number } }).connection
  conn?.addEventListener('change', () => log('net.change', { type: conn.type, eff: conn.effectiveType, rtt: conn.rtt, down: conn.downlink }))
}
