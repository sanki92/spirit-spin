import { assetUrl, hasAsset } from '../../assets/assets'
import { thumbPose, type Guide } from '../../game/guide'
import { reducedMotion } from '../../game/transitions'
import type { Countdown } from '../../state/hud'

const DIR = { '←': 'left', '→': 'right', '↑': 'up', '↓': 'down' } as const

export function GuideThumb({ guide, countdown, reduced = reducedMotion() }: { guide: Guide; countdown: Countdown; reduced?: boolean }) {
  const pose = thumbPose(guide.mode, countdown)
  if (pose === 'hidden') return null
  const thumb = hasAsset('ui/guide/thumb')
  const cls = ['guide-thumb', `g-${guide.mode}`, `p-${pose}`, guide.dir ? `to-${DIR[guide.dir]}` : '', guide.small ? 'small' : '', reduced ? 'still' : ''].filter(Boolean).join(' ')
  return (
    <div className={cls} aria-hidden="true">
      {thumb && guide.mode === 'steer' && <><div className="stick-base ghost" /><div className="stick-knob ghost" /></>}
      {thumb && guide.mode !== 'steer' && hasAsset('ui/guide/streak') && <img className="gt-streak" src={assetUrl('ui/guide/streak')} alt="" draggable={false} />}
      {thumb && hasAsset('ui/guide/ripple') && <img className="gt-ripple" src={assetUrl('ui/guide/ripple')} alt="" draggable={false} />}
      {thumb && <img className="gt-thumb" src={assetUrl('ui/guide/thumb')} alt="" draggable={false} />}
      {guide.pill && <div className="grip-pill gt-pill">{guide.pill}</div>}
    </div>
  )
}
