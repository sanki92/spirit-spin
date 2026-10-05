const GAP = 160
const PAUSE_MS = 120
let tripped = false

function block(reason: string, onTrip: (reason: string) => void): void {
  if (tripped) return
  tripped = true
  onTrip(reason)
  const wall = document.createElement('div')
  wall.setAttribute('role', 'alertdialog')
  wall.setAttribute('aria-modal', 'true')
  wall.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:grid;place-content:center;justify-items:center;gap:14px;padding:24px;text-align:center;background:#070b1f;color:#dfe6ff;font:700 17px Rajdhani,system-ui,sans-serif'
  const h = document.createElement('h2')
  h.textContent = 'Developer tools detected'
  h.style.cssText = "margin:0;font:400 40px 'Bebas Neue',sans-serif;letter-spacing:1px;color:#ff4d6a"
  const p = document.createElement('p')
  p.textContent = 'Spirit Spin is paused because developer tools were opened. Close them and reload the page to keep playing.'
  p.style.cssText = 'margin:0;max-width:34ch'
  const b = document.createElement('button')
  b.textContent = 'Reload'
  b.style.cssText = "min-height:48px;padding:0 28px;border:0;background:#ffc93c;color:#241300;font:400 24px 'Bebas Neue',sans-serif;letter-spacing:1px;cursor:pointer"
  b.onclick = () => location.reload()
  wall.append(h, p, b)
  document.body.appendChild(wall)
  const app = document.getElementById('root')
  if (app) {
    app.setAttribute('inert', '')
    app.style.display = 'none'
  }
}

export function startDevtoolsGuard(onTrip: (reason: string) => void): void {
  const desktop = window.matchMedia?.('(pointer: fine)').matches && !('ontouchstart' in window)
  const check = () => {
    if (tripped) return
    const t = performance.now()
    ;(0, eval)('debugger')
    if (performance.now() - t > PAUSE_MS) return block('debugger', onTrip)
    if (desktop && (window.outerWidth - window.innerWidth > GAP || window.outerHeight - window.innerHeight > GAP)) return block('size', onTrip)
    if (desktop) {
      const probe = new Image()
      Object.defineProperty(probe, 'id', { get: () => { block('console', onTrip); return '' } })
      console.debug('%c', probe)
    }
  }
  window.setInterval(check, 1000)
  window.addEventListener('resize', check)
  window.addEventListener('contextmenu', e => e.preventDefault())
  window.addEventListener('keydown', e => {
    const k = e.key.toLowerCase()
    const combo = (e.ctrlKey || e.metaKey) && ((e.shiftKey && ['i', 'j', 'c', 'k'].includes(k)) || (e.altKey && ['i', 'j', 'c'].includes(k)) || k === 'u')
    if (k === 'f12' || combo) {
      e.preventDefault()
      e.stopPropagation()
    }
  }, true)
}
