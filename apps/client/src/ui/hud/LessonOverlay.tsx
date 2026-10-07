import { useLayoutEffect, useState } from 'react'
import { useHud } from '../../state/hud'

const PAD = 8
const tap = () => useHud.setState(s => ({ lessonTaps: s.lessonTaps + 1 }))
const skip = () => useHud.setState(s => ({ lessonSkip: s.lessonSkip + 1 }))

export function LessonOverlay() {
  const training = useHud(s => s.training)
  const lesson = useHud(s => s.lesson)
  const [rect, setRect] = useState<DOMRect | null>(null)

  useLayoutEffect(() => {
    if (!lesson?.target) return setRect(null)
    const el = document.querySelector(lesson.target)
    const measure = () => setRect(el?.getBoundingClientRect() ?? null)
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [lesson])

  if (!training) return null
  const below = !!rect && rect.top + rect.height / 2 < window.innerHeight / 2
  const cardStyle = rect ? (below ? { top: rect.bottom + PAD + 18 } : { bottom: window.innerHeight - rect.top + PAD + 18 }) : undefined
  return (
    <>
      <button className="lesson-skip" onClick={skip}>Skip training</button>
      {lesson && (
        <div className={`lesson ${lesson.tap ? 'tapping' : 'acting'}`} onClick={lesson.tap ? tap : undefined} role="dialog" aria-label={lesson.title}>
          {rect
            ? <i className="lesson-spot" style={{ left: rect.left - PAD, top: rect.top - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }} />
            : <i className="lesson-dim" />}
          {lesson.arrow && <b className={`lesson-arrow a${'←→↑↓'.indexOf(lesson.arrow)}`} aria-hidden="true">{lesson.arrow}</b>}
          <section className={`lesson-card ${rect ? '' : 'center'}`} style={cardStyle}>
            <h3>{lesson.title}</h3>
            <p>{lesson.text}</p>
            {lesson.tap && <button className="cta cyan" onClick={e => { e.stopPropagation(); tap() }}><span>{lesson.tap}</span></button>}
          </section>
        </div>
      )}
    </>
  )
}
