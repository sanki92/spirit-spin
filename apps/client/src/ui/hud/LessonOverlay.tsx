import { useLayoutEffect, useState } from 'react'
import { assetUrl, hasAsset } from '../../assets/assets'
import { useHud } from '../../state/hud'

const PAD = 6
const SKIP_BOTTOM = 104
const tap = () => useHud.setState(s => ({ lessonTaps: s.lessonTaps + 1 }))
const skip = () => useHud.setState(s => ({ lessonSkip: s.lessonSkip + 1 }))
const DIR = { '←': 'left', '→': 'right', '↑': 'up', '↓': 'down' } as const

export function LessonOverlay() {
  const training = useHud(s => s.training)
  const lesson = useHud(s => s.lesson)
  const motion = useHud(s => s.inputMode === 'motion')
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
  const dir = lesson?.arrow ? DIR[lesson.arrow] : null
  const below = !!rect && rect.top + rect.height / 2 < window.innerHeight / 2
  const cardStyle = rect ? (below ? { top: Math.max(rect.bottom + PAD + 16, SKIP_BOTTOM) } : { bottom: window.innerHeight - rect.top + PAD + 16 }) : undefined
  return (
    <>
      <button className="lesson-skip" onClick={skip}>Skip tutorial</button>
      {lesson && (
        <div className={`lesson ${lesson.tap ? 'tapping' : 'acting'} ${lesson.id === 'nice' ? 'nice' : ''}`} onClick={lesson.tap ? tap : undefined} role="dialog" aria-label={lesson.title}>
          <svg className="lesson-shade" width="100%" height="100%" aria-hidden="true">
            <defs>
              <filter id="lesson-soft"><feGaussianBlur stdDeviation="4" /></filter>
              <mask id="lesson-cut">
                <rect width="100%" height="100%" fill="white" />
                {rect && <rect x={rect.left - PAD} y={rect.top - PAD} width={rect.width + PAD * 2} height={rect.height + PAD * 2} rx="10" fill="black" filter="url(#lesson-soft)" />}
              </mask>
            </defs>
            <rect width="100%" height="100%" mask="url(#lesson-cut)" />
          </svg>
          {dir && motion && hasAsset('onboarding/tilt-phone') && (
            <div className={`lesson-phone tilt-${dir}`} aria-hidden="true"><img src={assetUrl('onboarding/tilt-phone')} alt="" draggable={false} /></div>
          )}
          {dir && hasAsset('ui/tutorial-arrow') && (
            <img className={`lesson-arrow to-${dir} ${motion ? 'by-phone' : 'by-stick'}`} src={assetUrl('ui/tutorial-arrow')} alt="" draggable={false} aria-hidden="true" />
          )}
          <section className={`lesson-card ${rect ? '' : dir ? 'low' : 'center'}`} style={cardStyle}>
            <h3>{lesson.title}</h3>
            {lesson.text && <p>{lesson.text}</p>}
            {lesson.tap && <button className="cta cyan" onClick={e => { e.stopPropagation(); tap() }}><span>{lesson.tap}</span></button>}
          </section>
        </div>
      )}
    </>
  )
}
