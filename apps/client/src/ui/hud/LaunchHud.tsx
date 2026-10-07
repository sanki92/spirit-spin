import type { BeastId } from '@spirit/core'
import { useEffect, useRef, useState } from 'react'
import { assetUrl, hasAsset } from '../../assets/assets'
import { BEASTS } from '../../game/beasts'
import { useHud, type Callout } from '../../state/hud'
import './launch.css'

const TYPE: Record<string, string> = { attack: 'Attack', defense: 'Defense', stamina: 'Stamina', balance: 'Balance' }
const LADDER = ['WEAK', 'GOOD', 'GREAT', 'PERFECT'] as const
const CALLOUT_ART: Record<string, string> = { PERFECT: 'ui/callout-perfect', GREAT: 'ui/callout-great', GOOD: 'ui/callout-good', WEAK: 'ui/callout-weak', OVERSPIN: 'ui/callout-overspin' }
const GUIDE = [
  { id: 'onboarding/guide-grip', label: 'Grip', text: 'Both hands, screen facing you' },
  { id: 'onboarding/guide-ready', label: 'Ready', text: 'Eyes on the count' },
  { id: 'onboarding/guide-pull', label: 'Pull!', text: 'Fast and straight down' },
] as const

const still = () => document.documentElement.classList.contains('reduce-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches

function Pic({ id, className }: { id: string; className?: string }) {
  return hasAsset(id) ? <img className={className} src={assetUrl(id)} alt="" draggable={false} /> : null
}

export function VsIntro({ beasts, arts, names, types }: { beasts: [BeastId, BeastId]; arts: [string, string]; names: [string, string]; types: [string, string] }) {
  return (
    <div className="vs2" aria-label={`${names[0]} versus ${names[1]}`} role="img">
      <Pic id="backgrounds/vs-clash" className="vs2-bg" />
      {([1, 0] as const).map(i => (
        <div key={i} className={`vs2-side s${i}`} style={{ ['--c' as string]: BEASTS[beasts[i]].color }}>
          <Pic id={hasAsset(`${arts[i]}/cutin`) ? `${arts[i]}/cutin` : `beasts/${beasts[i]}/cutin`} className="vs2-art" />
          <div className="vs2-name">
            <small>{i === 0 ? 'You' : 'Rival'} · {TYPE[types[i]] ?? types[i]}</small>
            <strong>{names[i]}</strong>
          </div>
        </div>
      ))}
      <Pic id="ui/banner-vs" className="vs2-logo" />
      <i className="vs2-flash" />
    </div>
  )
}

export function GuideStrip({ size, active }: { size: 'mini' | 'big'; active?: number }) {
  return (
    <ol className={`guide ${size}`}>
      {GUIDE.map((g, i) => (
        <li key={g.id} className={active === i ? 'on' : ''}>
          <Pic id={g.id} />
          <b><span>{i + 1}</span>{g.label}</b>
          {size === 'big' && <small>{g.text}</small>}
        </li>
      ))}
    </ol>
  )
}

export function GripGuide({ motion, round, coach }: { motion: boolean; round: number; coach: boolean }) {
  if (coach) return <div className="grip-pill">Watch the countdown</div>
  if (round > 1 || !motion) return <div className="grip-pill">{round > 1 ? `Round ${round} · ` : ''}{motion ? 'Pull down on LAUNCH' : 'Swipe down on LAUNCH'}</div>
  return (
    <div className="grip-guide">
      <GuideStrip size="mini" />
      <p>Pull down on <b>LAUNCH</b></p>
    </div>
  )
}

export function CoachOverlay({ motion }: { motion: boolean }) {
  return (
    <>
      <div className="coach-talk">
        <Pic id="characters/commentator/pointing" className="coach-face" />
        <p>{motion ? 'Time out! Hold your phone like a launcher. When you’re ready, pull it down fast and straight.' : 'Time out! Put your thumb on the screen. When you’re ready, swipe down fast and straight.'}</p>
      </div>
      <div className="coach" role="dialog" aria-label="Launch lesson">
        {motion ? <GuideStrip size="big" active={2} /> : <div className="coach-swipe" aria-hidden="true"><span>⌄</span><span>⌄</span><span>⌄</span></div>}
        <strong className="coach-go">{motion ? 'Pull when you’re ready' : 'Swipe down to launch'}</strong>
        <small className="coach-calm">No rush. The clock is stopped.</small>
      </div>
    </>
  )
}

export function PullMeter() {
  const fill = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const apply = (p: number) => {
      const el = fill.current
      if (!el) return
      el.style.transform = `scaleY(${Math.min(1, p / 2)})`
      el.dataset.zone = p > 1.6 ? 'over' : p >= 0.7 ? 'max' : 'low'
    }
    apply(useHud.getState().pull)
    return useHud.subscribe(s => apply(s.pull))
  }, [])
  return (
    <div className="pull-meter" aria-hidden="true">
      <div className="pull-track">
        <i className="pull-over" />
        <i className="pull-max" />
        <div ref={fill} className="pull-fill" />
      </div>
      <span>Pull</span>
    </div>
  )
}

function RpmCounter({ rpm }: { rpm: number }) {
  const [v, setV] = useState(() => (still() ? rpm : 0))
  useEffect(() => {
    if (still()) return setV(rpm)
    let raf = 0
    const t0 = performance.now()
    const run = (now: number) => {
      const k = Math.min(1, (now - t0) / 650)
      setV(Math.round((rpm * (1 - (1 - k) ** 3)) / 10) * 10)
      if (k < 1) raf = requestAnimationFrame(run)
    }
    raf = requestAnimationFrame(run)
    return () => cancelAnimationFrame(raf)
  }, [rpm])
  return <div className="rpm">{v.toLocaleString()} <span>RPM</span></div>
}

export function LaunchCallout({ callout, color }: { callout: Callout; color: string }) {
  const q = callout.quality
  const rank = LADDER.indexOf(q as (typeof LADDER)[number])
  return (
    <>
    {q === 'PERFECT' && <i className="launch-burst" style={{ ['--c' as string]: color }} />}
    <div className={`callout launch-callout pop q-${q.toLowerCase()}`} style={{ ['--c' as string]: color }}>
      {q === 'FAIL' ? <div className="art-text callout-fail">{callout.note}</div> : hasAsset(CALLOUT_ART[q] ?? '') ? <img className="callout-img" src={assetUrl(CALLOUT_ART[q]!)} alt={q} draggable={false} /> : <div className="art-text">{q}</div>}
      <RpmCounter rpm={callout.rpm} />
      {q !== 'OVERSPIN' && (
        <ol className="ladder" aria-label={q === 'FAIL' ? 'Missed launch' : `${q} launch`}>
          {LADDER.map((l, i) => <li key={l} className={i <= rank ? 'on' : ''} style={{ animationDelay: `${0.12 + i * 0.09}s` }}>{l}</li>)}
        </ol>
      )}
    </div>
    </>
  )
}

export function CoachTipCard({ tip }: { tip: { title: string; text: string } }) {
  return (
    <div className="coach-tip" role="status">
      <Pic id="characters/commentator/thumbs-up" className="coach-tip-face" />
      <p><strong>{tip.title}</strong>{tip.text}</p>
    </div>
  )
}
