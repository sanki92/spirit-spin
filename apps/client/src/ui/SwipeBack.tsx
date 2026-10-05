import { useEffect, useRef, useState, type ReactNode } from 'react'
import { canSwipeBack, PeekContext } from '../state/back'
import { useNav } from '../state/nav'

const EDGE_PX = 28
const SETTLE_MS = 260
const PARALLAX = 30

const iosInstalled = typeof navigator !== 'undefined' && (navigator as Navigator & { standalone?: boolean }).standalone === true
const forced = import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).has('swipeback')

export function SwipeStack({ top, under }: { top: ReactNode; under: (() => ReactNode) | null }) {
  const [peek, setPeek] = useState(false)
  const topRef = useRef<HTMLDivElement>(null)
  const underRef = useRef<HTMLDivElement>(null)
  const shadeRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!iosInstalled && !forced) return
    let start: { x: number; y: number } | null = null
    let engaged = false
    let settling = false
    let last = { x: 0, t: 0 }
    let vx = 0
    const width = () => window.innerWidth
    const paint = (dx: number, animate: boolean) => {
      const tr = animate ? `transform ${SETTLE_MS}ms cubic-bezier(.2,.8,.2,1)` : 'none'
      const p = Math.min(1, Math.max(0, dx / width()))
      const t = topRef.current, u = underRef.current, s = shadeRef.current
      if (t) { t.style.transition = tr; t.style.transform = dx > 0 ? `translate3d(${dx}px,0,0)` : '' }
      if (u) { u.style.transition = tr; u.style.transform = `translate3d(${(p - 1) * PARALLAX}%,0,0)` }
      if (s) { s.style.transition = animate ? `opacity ${SETTLE_MS}ms ease-out` : 'none'; s.style.opacity = String(0.5 * (1 - p)) }
    }
    const reset = () => {
      paint(0, false)
      topRef.current?.classList.remove('swiping')
      start = null
      engaged = false
      settling = false
    }
    const onStart = (e: TouchEvent) => {
      if (settling || e.touches.length !== 1) return
      const t = e.touches[0]!
      if (t.clientX > EDGE_PX || !canSwipeBack()) return
      start = { x: t.clientX, y: t.clientY }
      last = { x: t.clientX, t: e.timeStamp }
      vx = 0
    }
    const onMove = (e: TouchEvent) => {
      if (!start) return
      const t = e.touches[0]!
      const dx = t.clientX - start.x, dy = t.clientY - start.y
      if (!engaged) {
        if (Math.abs(dy) > 10 && Math.abs(dy) > dx) { start = null; return }
        if (dx < 10 || dx < Math.abs(dy)) return
        engaged = true
        topRef.current?.classList.add('swiping')
        setPeek(true)
      }
      e.preventDefault()
      const dt = e.timeStamp - last.t
      if (dt > 0) vx = 0.7 * ((t.clientX - last.x) / dt) + 0.3 * vx
      last = { x: t.clientX, t: e.timeStamp }
      paint(Math.max(0, dx), false)
    }
    const onEnd = (e: TouchEvent) => {
      if (!start) return
      if (!engaged) { start = null; return }
      const dx = Math.max(0, (e.changedTouches[0]?.clientX ?? last.x) - start.x)
      const done = dx > width() * 0.35 || (vx > 0.35 && dx > 40)
      settling = true
      paint(done ? width() : 0, true)
      window.setTimeout(() => {
        reset()
        setPeek(false)
        if (done) useNav.getState().back()
      }, SETTLE_MS)
    }
    const opts = { passive: false } as const
    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, opts)
    window.addEventListener('touchend', onEnd)
    window.addEventListener('touchcancel', onEnd)
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
    }
  }, [])

  return (
    <>
      {peek && under && (
        <div ref={underRef} className="swipe-under" inert aria-hidden="true">
          <PeekContext.Provider value={true}>{under()}</PeekContext.Provider>
          <i ref={shadeRef} className="swipe-shade" />
        </div>
      )}
      <div ref={topRef} className="swipe-top">{top}</div>
    </>
  )
}
