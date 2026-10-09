import { pullCurve, type RipFail, type RipResult } from '@spirit/core'

export interface CoachTip { title: string; text: string }

const next = (swipe: boolean) => `In real rounds, ${swipe ? 'flick' : 'pull'} right on LAUNCH.`

export function coachTip(r: RipResult | RipFail, swipe: boolean): CoachTip {
  const move = swipe ? 'swipe' : 'pull'
  const NEXT = next(swipe)
  if (!r.ok) return { title: 'Too soft', text: `Snap it faster: one sharp ${move} down. ${NEXT}` }
  if (r.overspin) return { title: 'Overspin!', text: `Strong, but too hard makes it wobble. A clean ${move} beats a big one. ${NEXT}` }
  if (r.straightness < 0.6) return { title: `${title(r)} — keep it straight`, text: `Don't twist: ${move} straight down. ${NEXT}` }
  if (pullCurve(r.pullRatio) < 0.6) return { title: `${title(r)} — snap it faster`, text: `A quicker ${move} spins it harder. ${NEXT}` }
  return { title: `${title(r)} form!`, text: `That's how it's done. ${NEXT}` }
}

const title = (r: RipResult) => (r.quality === 'PERFECT' ? 'Perfect' : r.quality === 'GREAT' ? 'Great' : r.quality === 'GOOD' ? 'Good' : 'Weak')
