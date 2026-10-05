import { Component, type ReactNode } from 'react'
import { useNav } from './state/nav'

const STALE = /dynamically imported module|Importing a module script failed|error loading dynamically imported|Unable to preload|module script|MIME type/i
const RELOADED = 'spirit-stale-reload'
let sent = 0

export const isStale = (err: unknown): boolean => STALE.test(String((err as Error | undefined)?.message ?? err))

export function reportCrash(kind: string, err: unknown): void {
  if (import.meta.env.DEV || sent++ >= 5) return
  const e = err as Error | undefined
  const body = JSON.stringify({ kind, msg: String(e?.message ?? err).slice(0, 400), stack: e?.stack?.slice(0, 2000), screen: useNav.getState().stack.at(-1)?.k })
  void fetch('/v1/client-error', { method: 'POST', body, headers: { 'content-type': 'application/json' }, keepalive: true }).catch(() => undefined)
}

export function reloadForUpdate(): boolean {
  try {
    if (Date.now() - Number(sessionStorage.getItem(RELOADED) ?? 0) < 30_000) return false
    sessionStorage.setItem(RELOADED, String(Date.now()))
  } catch { return false }
  location.reload()
  return true
}

export function installCrashReporting(): void {
  addEventListener('vite:preloadError', e => { reportCrash('stale', (e as Event & { payload?: unknown }).payload); if (reloadForUpdate()) e.preventDefault() })
  addEventListener('error', e => reportCrash('error', e.error ?? e.message))
  addEventListener('unhandledrejection', e => reportCrash('rejection', e.reason))
}

export class CrashGuard extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  override componentDidCatch(err: unknown) {
    const stale = isStale(err)
    reportCrash(stale ? 'stale' : 'render', err)
    if (stale) reloadForUpdate()
  }
  override render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="screen page crash" role="alert">
        <h1 className="slant">Something went wrong</h1>
        <p>Reload to jump back in.</p>
        <button className="slash cyan" onClick={() => location.reload()}><span>Reload</span></button>
      </div>
    )
  }
}
