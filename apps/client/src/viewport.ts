import { log } from './telemetry'

const isStandalone = () => (navigator as Navigator & { standalone?: boolean }).standalone === true || matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches

function inset(side: 'top' | 'bottom'): number {
  const probe = document.createElement('div')
  probe.style.cssText = `position:fixed;visibility:hidden;pointer-events:none;height:env(safe-area-inset-${side},0px)`
  document.body.appendChild(probe)
  const h = probe.getBoundingClientRect().height
  probe.remove()
  return Math.round(h)
}

export function fitViewport(): void {
  const root = document.documentElement
  const apply = () => {
    const portrait = innerHeight >= innerWidth
    const full = portrait ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height)
    const top = inset('top')
    const underStatusBar = top > 0 && innerHeight + top >= full - 2 && innerHeight < full
    if (isStandalone() || underStatusBar) root.style.setProperty('--app-h', `${Math.max(full, innerHeight)}px`)
    else root.style.removeProperty('--app-h')
  }
  const report = (why: string) => {
    const scr = document.querySelector('.screen')?.getBoundingClientRect()
    log('viewport', {
      why, standalone: isStandalone(), navStandalone: (navigator as Navigator & { standalone?: boolean }).standalone ?? null,
      inner: [innerWidth, innerHeight], screen: [screen.width, screen.height], vv: visualViewport ? [Math.round(visualViewport.width), Math.round(visualViewport.height)] : null,
      client: document.documentElement.clientHeight, appH: getComputedStyle(root).getPropertyValue('--app-h').trim(), screenEl: scr ? Math.round(scr.height) : null,
      safeTop: inset('top'), safeBottom: inset('bottom'), dpr: devicePixelRatio,
    })
  }
  apply()
  addEventListener('resize', apply)
  addEventListener('orientationchange', () => window.setTimeout(apply, 300))
  window.setTimeout(() => report('boot'), 2500)
}
