import { modalOpen } from './state/back'
import { useNav } from './state/nav'

const BUSY = new Set(['battle', 'live', 'ghost', 'result', 'welcome', 'calibrate'])

export function keepUpdated(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  const sw = navigator.serviceWorker
  const hadController = !!sw.controller
  let pending = false
  const safe = () => !BUSY.has(useNav.getState().stack.at(-1)?.k ?? '') && !modalOpen()
  const reloadWhenSafe = () => { if (pending && safe()) location.reload() }
  sw.addEventListener('controllerchange', () => {
    if (!hadController) return
    pending = true
    reloadWhenSafe()
  })
  useNav.subscribe(reloadWhenSafe)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return
    reloadWhenSafe()
    void sw.getRegistration().then(r => r?.update()).catch(() => undefined)
  })
}
