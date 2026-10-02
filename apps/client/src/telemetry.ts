type Entry = { t: number; s: string; type: string; data?: unknown }

const enabled = import.meta.env.DEV || new URLSearchParams(location.search).has('debug')
const session = Math.random().toString(36).slice(2, 8)
const t0 = performance.now()
let queue: Entry[] = []
let timer = 0

function flush(): void {
  if (!queue.length) return
  const body = JSON.stringify(queue)
  queue = []
  if (!navigator.sendBeacon?.('/__log', new Blob([body], { type: 'application/json' }))) {
    void fetch('/__log', { method: 'POST', body, headers: { 'content-type': 'application/json' }, keepalive: true }).catch(() => undefined)
  }
}

export function log(type: string, data?: unknown): void {
  if (!enabled) return
  queue.push({ t: Math.round(performance.now() - t0), s: session, type, data })
  if (queue.length > 40) flush()
  else if (!timer) timer = window.setTimeout(() => { timer = 0; flush() }, 1500)
}

export function installTelemetry(): void {
  if (!enabled) return
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { effectiveType?: string } }
  log('session', {
    ua: navigator.userAgent, w: innerWidth, h: innerHeight, dpr: devicePixelRatio, cores: navigator.hardwareConcurrency,
    mem: nav.deviceMemory ?? null, net: nav.connection?.effectiveType ?? null, standalone: matchMedia('(display-mode: standalone)').matches,
    secure: isSecureContext, motionApi: 'DeviceMotionEvent' in window, motionNeedsPermission: typeof (DeviceMotionEvent as unknown as { requestPermission?: unknown }).requestPermission === 'function',
  })
  addEventListener('error', e => log('error', { msg: e.message, src: e.filename, line: e.lineno, col: e.colno, stack: (e.error as Error | undefined)?.stack?.slice(0, 600) }))
  addEventListener('unhandledrejection', e => log('rejection', { reason: String((e.reason as Error)?.stack ?? e.reason).slice(0, 600) }))
  document.addEventListener('visibilitychange', () => { log('visibility', document.visibilityState); if (document.visibilityState === 'hidden') flush() })
  addEventListener('orientationchange', () => log('orientation', { w: innerWidth, h: innerHeight, angle: screen.orientation?.angle }))
  addEventListener('resize', () => log('resize', { w: innerWidth, h: innerHeight }))
  addEventListener('pointerdown', e => {
    const el = e.target as HTMLElement | null
    const label = el?.closest('button')?.textContent?.trim().slice(0, 40) ?? el?.className?.toString().slice(0, 40)
    log('tap', { x: Math.round(e.clientX), y: Math.round(e.clientY), label, type: e.pointerType })
  }, { passive: true, capture: true })
  addEventListener('pagehide', flush)
}
