import type { TouchSample } from '@spirit/core'

export function captureSwipe(el: HTMLElement, onDone: (pts: TouchSample[]) => void): () => void {
  let pts: TouchSample[] = []
  let active = false
  const down = (e: PointerEvent) => {
    active = true
    pts = [{ t: e.timeStamp || performance.now(), x: e.clientX, y: e.clientY }]
  }
  const move = (e: PointerEvent) => {
    if (!active) return
    const all = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : []
    for (const c of all.length ? all : [e]) {
      const t = c.timeStamp || performance.now()
      if (t > (pts[pts.length - 1]?.t ?? -Infinity)) pts.push({ t, x: c.clientX, y: c.clientY })
    }
  }
  const up = () => {
    if (!active) return
    active = false
    onDone(pts)
  }
  el.addEventListener('pointerdown', down)
  el.addEventListener('pointermove', move)
  el.addEventListener('pointerup', up)
  el.addEventListener('pointercancel', up)
  return () => {
    el.removeEventListener('pointerdown', down)
    el.removeEventListener('pointermove', move)
    el.removeEventListener('pointerup', up)
    el.removeEventListener('pointercancel', up)
  }
}
