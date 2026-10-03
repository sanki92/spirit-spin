import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { hasAsset, assetUrl } from '../../assets/assets'
import { TECHNIQUES, type BeastId } from '@spirit/core'
import { BEASTS } from '../../game/beasts'
import { useHud, type Banner } from '../../state/hud'
import { useSave } from '../../state/save'

const BANNER_ART: Record<Exclude<Banner, null>, string> = {
  spin: 'ui/banner-finish-spin', ringout: 'ui/banner-finish-ringout', shatter: 'ui/banner-finish-shatter', spirit: 'ui/banner-finish-spirit',
  draw: 'ui/banner-vs', victory: 'ui/banner-victory', defeat: 'ui/banner-defeat', vs: 'ui/banner-vs', spiritCall: 'ui/banner-spirit-call', shout: 'ui/banner-shout',
}
const BANNER_TEXT: Record<Exclude<Banner, null>, string> = {
  spin: 'SPIN FINISH', ringout: 'RING OUT', shatter: 'SHATTER FINISH', spirit: 'SPIRIT FINISH', draw: 'DRAW',
  victory: 'VICTORY', defeat: 'DEFEAT', vs: 'VS', spiritCall: 'SPIRIT CALL!', shout: 'SHOUT!',
}
const COUNT_ART: Record<string, string> = { '3': 'ui/countdown-3', '2': 'ui/countdown-2', '1': 'ui/countdown-1', LAUNCH: 'ui/countdown-launch' }
const CALLOUT_ART: Record<string, string> = { PERFECT: 'ui/callout-perfect', GREAT: 'ui/callout-great', GOOD: 'ui/callout-good', WEAK: 'ui/callout-weak', OVERSPIN: 'ui/callout-overspin' }

function Art({ id, text, className }: { id: string; text: string; className: string }) {
  return hasAsset(id) ? <img className={className} src={assetUrl(id)} alt={text} draggable={false} /> : <div className={`${className} art-text`}>{text}</div>
}

export function BattleHud({ names, beasts, onSpirit, onSwipeZone, onStick, spectator = false }: {
  spectator?: boolean
  names: [string, string]
  beasts: [BeastId, BeastId]
  onSpirit: () => void
  onSwipeZone: (el: HTMLDivElement | null) => void
  onStick: (x: number, y: number) => void
}) {
  const h = useHud(useShallow(s => ({ phase: s.phase, countdown: s.countdown, round: s.round, scores: s.scores, callout: s.callout, banner: s.banner, cutin: s.cutin, inputMode: s.inputMode, spiritActive: s.spiritActive, notice: s.notice, announcer: s.announcer, cine: s.cine })))
  const ready = useHud(s => s.gauge[0] >= 1 && s.phase === 'battle')
  return (
    <div className="hud">
      <div className="hud-top">
        <Side name={names[0]} beast={beasts[0]} score={h.scores[0]} side={0} active={h.spiritActive[0]} align="left" />
        <div className="round">R{h.round}</div>
        <Side name={names[1]} beast={beasts[1]} score={h.scores[1]} side={1} active={h.spiritActive[1]} align="right" />
      </div>
      {(h.phase === 'grip' || h.phase === 'countdown') && (
        <div className={`launch-overlay phase-${h.phase}`} ref={spectator ? undefined : onSwipeZone}>
          {h.phase === 'grip' && <LaunchCard spectator={spectator} motion={h.inputMode === 'motion'} beast={beasts[0]} first={h.round === 1} />}
          {h.phase === 'countdown' && h.countdown && h.countdown !== 'LAUNCH' && <Art key={h.countdown} id={COUNT_ART[h.countdown] ?? ''} text={h.countdown} className="countdown tick" />}
          {h.phase === 'countdown' && h.countdown !== 'LAUNCH' && <div className="launch-hint">{spectator ? 'Players rip on LAUNCH' : h.inputMode === 'motion' ? 'Pull DOWN on LAUNCH' : 'Swipe DOWN on LAUNCH'}</div>}
        </div>
      )}
      {h.countdown === 'LAUNCH' && (
        <div className="launch-flash" aria-live="assertive">
          <Art id={COUNT_ART.LAUNCH!} text="LAUNCH!" className="launch-word" />
        </div>
      )}
      {h.callout && (
        <div className="callout pop">
          {h.callout.quality === 'FAIL' ? <div className="art-text callout-fail">{h.callout.note}</div> : <Art id={CALLOUT_ART[h.callout.quality] ?? ''} text={h.callout.quality} className="callout-img" />}
          <div className="rpm">{h.callout.rpm.toLocaleString()} <span>RPM</span></div>
        </div>
      )}
      {h.banner && h.phase !== 'grip' && h.phase !== 'countdown' && <Art key={h.banner} id={BANNER_ART[h.banner]} text={BANNER_TEXT[h.banner]} className={`banner pop ${h.banner}`} />}
      {h.cine && (
        <button className="cine" onClick={h.cine.skip} aria-label="Skip finish replay">
          <i className="cine-bar top" />
          <i className="cine-bar bottom" />
          {hasAsset('vfx/speedlines') && <img className="cine-lines" src={assetUrl('vfx/speedlines')} alt="" draggable={false} />}
          <span className="cine-tag">Final blow</span>
          <span className="cine-skip">Tap to skip</span>
        </button>
      )}
      {h.notice && <div className="hud-notice" role="status">{h.notice}</div>}
      {h.announcer && (
        <div key={h.announcer.id} className="announcer" aria-live="polite">
          <Art id={`characters/commentator/${h.announcer.face}`} text="" className="announcer-face" />
          <p>{h.announcer.text}</p>
        </div>
      )}
      {h.cutin && <CutIn beast={h.cutin.beast} side={h.cutin.side} hesitate={h.cutin.hesitate} />}
      {h.phase === 'battle' && !spectator && (
        <>
          <Stick onStick={onStick} />
          <button className={`spirit-btn ${ready ? 'ready' : ''}`} onPointerDown={onSpirit} disabled={!ready}>
            <Live className="gauge" get={st => ({ height: `${Math.min(1, st.gauge[0]) * 100}%` })} />
            <span>{ready ? 'SHOUT!' : 'SPIRIT'}</span>
            {ready && <Live className="shout-meter" get={st => ({ transform: `scaleX(${st.shoutLevel})` })} />}
          </button>
        </>
      )}
    </div>
  )
}

function Live({ className, get }: { className: string; get: (s: ReturnType<typeof useHud.getState>) => Partial<Record<'height' | 'width' | 'transform', string>> }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const apply = (st: ReturnType<typeof useHud.getState>) => {
      if (ref.current) Object.assign(ref.current.style, get(st))
    }
    apply(useHud.getState())
    return useHud.subscribe(apply)
  }, [get])
  return <div ref={ref} className={className} />
}

function Side({ name, beast, score, side, active, align }: { name: string; beast: BeastId; score: number; side: 0 | 1; active: boolean; align: 'left' | 'right' }) {
  const plate = `ui/hud-plate-${beast}`
  return (
    <div className={`side ${align} ${active ? 'active' : ''} ${hasAsset(plate) ? 'plated' : ''}`} style={{ ['--c' as string]: BEASTS[beast].color }}>
      {hasAsset(plate) && <img className="plate" src={assetUrl(plate)} alt="" draggable={false} />}
      <div className="side-row">
        <div className="name">{name}</div>
        <div className="pips" aria-label={`${score} points`}>{[0, 1, 2, 3].map(i => <i key={i} className={i < score ? 'on' : ''} />)}</div>
      </div>
      <div className="spinbar"><Live className="" get={st => ({ width: `${Math.max(0, Math.min(1, st.spin[side])) * 100}%` })} /></div>
    </div>
  )
}

function CutIn({ beast, side, hesitate }: { beast: keyof typeof BEASTS; side: 0 | 1; hesitate: boolean }) {
  const info = BEASTS[beast]
  const art = hesitate ? `beasts/${beast}/expressions/sulky` : `beasts/${beast}/cutin`
  return (
    <div className={`cutin ${side === 1 ? 'enemy' : ''} ${hesitate ? 'hesitate' : ''}`} style={{ ['--c' as string]: info.color }}>
      {hasAsset(art) && <img src={assetUrl(art)} alt="" draggable={false} />}
      <div className="cutin-name">{hesitate ? '…' : info.name}</div>
      {!hesitate && <div className="cutin-tech">{TECHNIQUES[beast].technique.name}</div>}
      {hesitate && <div className="cutin-line">"…I don't know you yet."</div>}
    </div>
  )
}

function Stick({ onStick }: { onStick: (x: number, y: number) => void }) {
  const origin = useRef<{ x: number; y: number } | null>(null)
  const [knob, setKnob] = useState<{ x: number; y: number } | null>(null)
  useEffect(() => {
    const keys = new Set<string>()
    const apply = () => onStick((keys.has('ArrowRight') || keys.has('d') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('a') ? 1 : 0), (keys.has('ArrowUp') || keys.has('w') ? 1 : 0) - (keys.has('ArrowDown') || keys.has('s') ? 1 : 0))
    const down = (e: KeyboardEvent) => { keys.add(e.key); apply() }
    const up = (e: KeyboardEvent) => { keys.delete(e.key); apply() }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [onStick])
  return (
    <div
      className="stick-zone"
      onPointerDown={e => { origin.current = { x: e.clientX, y: e.clientY }; setKnob({ x: e.clientX, y: e.clientY }); (e.target as HTMLElement).setPointerCapture(e.pointerId) }}
      onPointerMove={e => {
        if (!origin.current) return
        const dx = Math.max(-1, Math.min(1, (e.clientX - origin.current.x) / 70)), dy = Math.max(-1, Math.min(1, (e.clientY - origin.current.y) / 70))
        setKnob({ x: origin.current.x + dx * 70, y: origin.current.y + dy * 70 })
        onStick(dx, -dy)
      }}
      onPointerUp={() => { origin.current = null; setKnob(null); onStick(0, 0) }}
    >
      {knob && origin.current && (
        <>
          <div className="stick-base" style={{ left: origin.current.x, top: origin.current.y }} />
          <div className="stick-knob" style={{ left: knob.x, top: knob.y }} />
        </>
      )}
    </div>
  )
}

function LaunchCard({ spectator, motion, beast, first }: { spectator: boolean; motion: boolean; beast: BeastId; first: boolean }) {
  const s = useSave.getState()
  const id = s.cosmetics?.launcher ?? `launcher-${s.starter ?? beast}`
  const art = `launchers/${id.replace('launcher-', '')}`
  if (spectator) return <div className="launch-card"><strong>Phones ready</strong><p>Players rip on LAUNCH</p></div>
  return (
    <div className={`launch-card ${first ? 'first' : ''}`}>
      {hasAsset(art) && <img className="launch-card-art" src={assetUrl(art)} alt="" draggable={false} />}
      <strong>{motion ? 'Grip your phone' : 'Thumb on the screen'}</strong>
      {motion ? (
        <ol>
          <li><span>Hold it with both hands, screen facing you</span></li>
          <li><span>On <b>LAUNCH</b>, pull it down toward you, fast and straight</span></li>
        </ol>
      ) : (
        <ol>
          <li><span>Rest your thumb near the top</span></li>
          <li><span>On <b>LAUNCH</b>, swipe down fast and straight</span></li>
        </ol>
      )}
    </div>
  )
}
