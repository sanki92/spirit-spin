import { useLayoutEffect, useRef, useState } from 'react'
import { assetUrl, hasAsset } from '../../assets/assets'
import { useHud } from '../../state/hud'

const PAD = 6
const SKIP_BOTTOM = 104
const LIFT_Y = 0.3
const tap = () => useHud.setState(s => ({ lessonTaps: s.lessonTaps + 1 }))
const skip = () => useHud.setState(s => ({ lessonSkip: s.lessonSkip + 1 }))
const DIR = { '←': 'left', '→': 'right', '↑': 'up', '↓': 'down' } as const

interface Lift { from: DOMRect; scale: number; dx: number; dy: number }

export function LessonOverlay() {
  const training = useHud(s => s.training)
  const lesson = useHud(s => s.lesson)
  const motion = useHud(s => s.inputMode === 'motion')
  const cutin = useHud(s => !!s.cutin)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [lift, setLift] = useState<Lift | null>(null)
  const [lifted, setLifted] = useState(false)
  const host = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    setLift(null)
    setLifted(false)
    if (!lesson?.target) return setRect(null)
    const el = document.querySelector<HTMLElement>(lesson.target)
    setRect(el?.getBoundingClientRect() ?? null)
    const frame = el?.closest<HTMLElement>('.side') ?? el
    const r = frame?.getBoundingClientRect() ?? null
    if (!el || !r || !lesson.tap) return
    const scale = Math.min(3.5, Math.min(window.innerWidth - 64, 320) / r.width)
    setLift({ from: r, scale, dx: window.innerWidth / 2 - (r.left + r.width / 2), dy: window.innerHeight * LIFT_Y - (r.top + r.height / 2) })
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setLifted(true)))
    return () => cancelAnimationFrame(raf)
  }, [lesson])

  useLayoutEffect(() => {
    const box = host.current, el = lesson?.target ? document.querySelector<HTMLElement>(lesson.target) : null
    if (!box || !lift || !el) return
    const frame = el.closest<HTMLElement>('.side') ?? el
    const copy = frame.cloneNode(true) as HTMLElement
    copy.style.margin = '0'
    copy.style.width = `${lift.from.width}px`
    box.replaceChildren(copy)
    const focusClass = el.classList[0]
    const focus = focusClass ? copy.querySelector<HTMLElement>(`.${focusClass}`) : null
    focus?.classList.add('lesson-focus')
    for (const part of copy.querySelectorAll<HTMLElement>('.name, .pips, .spinbar, .guardbar')) if (part !== focus) part.classList.add('lesson-faded')
    const pips = lesson?.id === 'points' && focus ? [...focus.querySelectorAll('i')] : []
    const timers = pips.map((p, i) => window.setTimeout(() => p.classList.add('on'), 650 + i * 280))
    return () => { timers.forEach(clearTimeout); box.replaceChildren() }
  }, [lift, lesson])

  if (!training) return null
  const dir = lesson?.arrow ? DIR[lesson.arrow] : null
  const cut = rect && !lift ? rect : null
  const liftBottom = lift ? window.innerHeight * LIFT_Y + (lift.from.height * lift.scale) / 2 : 0
  const below = !!cut && cut.top + cut.height / 2 < window.innerHeight / 2
  const cardStyle = lift ? { top: liftBottom + 28 } : cut ? (below ? { top: Math.max(cut.bottom + PAD + 16, SKIP_BOTTOM) } : { bottom: window.innerHeight - cut.top + PAD + 16 }) : undefined
  return (
    <>
      {!cutin && lesson?.id !== 'done' && <button className="lesson-skip" onClick={skip}>Skip tutorial</button>}
      {lesson && (
        <div className={`lesson ${lesson.tap ? 'tapping' : 'acting'} ${lesson.id === 'nice' ? 'nice' : ''} ${lift ? 'lifting' : ''}`} onClick={lesson.tap ? tap : undefined} role="dialog" aria-label={lesson.title}>
          <svg className="lesson-shade" width="100%" height="100%" aria-hidden="true">
            <defs>
              <filter id="lesson-soft"><feGaussianBlur stdDeviation="4" /></filter>
              <mask id="lesson-cut">
                <rect width="100%" height="100%" fill="white" />
                {cut && <rect x={cut.left - PAD} y={cut.top - PAD} width={cut.width + PAD * 2} height={cut.height + PAD * 2} rx="10" fill="black" filter="url(#lesson-soft)" />}
              </mask>
            </defs>
            <rect width="100%" height="100%" mask="url(#lesson-cut)" />
          </svg>
          {lift && (
            <div
              ref={host}
              className={`lesson-lift ${lifted ? 'up' : ''}`}
              aria-hidden="true"
              style={{ left: lift.from.left, top: lift.from.top, width: lift.from.width, height: lift.from.height, transform: lifted ? `translate(${lift.dx}px, ${lift.dy}px) scale(${lift.scale})` : 'none' }}
            />
          )}
          {dir && motion && hasAsset('onboarding/tilt-phone') && (
            <div className={`lesson-phone tilt-${dir}`} aria-hidden="true"><img src={assetUrl('onboarding/tilt-phone')} alt="" draggable={false} /></div>
          )}
          {dir && hasAsset('ui/tutorial-arrow') && (
            <img className={`lesson-arrow to-${dir} ${motion ? 'by-phone' : 'by-stick'}`} src={assetUrl('ui/tutorial-arrow')} alt="" draggable={false} aria-hidden="true" />
          )}
          <section className={`lesson-card ${lift ? 'after-lift' : cut ? '' : dir ? 'low' : 'center'} ${lift && !lifted ? 'wait' : ''}`} style={cardStyle}>
            <h3>{lesson.title}</h3>
            {lesson.text && <p>{lesson.text}</p>}
            {lesson.tap && <button className="cta cyan" onClick={e => { e.stopPropagation(); tap() }}><span>{lesson.tap}</span></button>}
          </section>
        </div>
      )}
    </>
  )
}
