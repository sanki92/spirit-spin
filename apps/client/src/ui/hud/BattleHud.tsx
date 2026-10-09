import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { hasAsset, assetUrl } from '../../assets/assets'
import { TECHNIQUES, type BeastId } from '@spirit/core'
import { BEASTS } from '../../game/beasts'
import { spiritReady, spiritRefused, stickLive, useHud, type Banner } from '../../state/hud'
import { LessonOverlay } from './LessonOverlay'
import { CoachOverlay, CoachTipCard, GripGuide, LaunchCallout, PullMeter, VsIntro } from './LaunchHud'
import { GuideThumb } from './GuideThumb'
import { guideLive } from '../../game/guide'

const BANNER_ART: Record<Exclude<Banner, null>, string> = {
  spin: 'ui/banner-finish-spin', ringout: 'ui/banner-finish-ringout', shatter: 'ui/banner-finish-shatter', spirit: 'ui/banner-finish-spirit',
  draw: 'ui/banner-vs', victory: 'ui/banner-victory', defeat: 'ui/banner-defeat', vs: 'ui/banner-vs', spiritCall: 'ui/banner-spirit-call', shout: 'ui/banner-shout',
}
const BANNER_TEXT: Record<Exclude<Banner, null>, string> = {
  spin: 'SPIN FINISH', ringout: 'RING OUT', shatter: 'SHATTER FINISH', spirit: 'SPIRIT FINISH', draw: 'DRAW',
  victory: 'VICTORY', defeat: 'DEFEAT', vs: 'VS', spiritCall: 'SPIRIT CALL!', shout: 'SHOUT!',
}
const COUNT_ART: Record<string, string> = { '3': 'ui/countdown-3', '2': 'ui/countdown-2', '1': 'ui/countdown-1', LAUNCH: 'ui/countdown-launch' }

function Art({ id, text, className }: { id: string; text: string; className: string }) {
  return hasAsset(id) ? <img className={className} src={assetUrl(id)} alt={text} draggable={false} /> : <div className={`${className} art-text`}>{text}</div>
}

export function BattleHud({ names, beasts, arts, types, onSpirit, onSwipeZone, onStick, spectator = false }: {
  spectator?: boolean
  names: [string, string]
  beasts: [BeastId, BeastId]
  arts: [string, string]
  types: [string, string]
  onSpirit: () => void
  onSwipeZone: (el: HTMLDivElement | null) => void
  onStick: (x: number, y: number) => void
}) {
  const h = useHud(useShallow(s => ({ phase: s.phase, countdown: s.countdown, round: s.round, scores: s.scores, callout: s.callout, banner: s.banner, cutin: s.cutin, inputMode: s.inputMode, spiritActive: s.spiritActive, notice: s.notice, announcer: s.announcer, cine: s.cine, summon: s.summon, refused: s.refused, coach: s.coach, coachTip: s.coachTip, edge: s.edge, saved: s.saved, guide: s.guide })))
  const ready = useHud(spiritReady)
  const blocked = useHud(spiritRefused)
  return (
    <div className={`hud phase-${h.phase}${h.coachTip ? " tipping" : ""}`}>
      <div className="hud-top">
        <Side name={names[0]} beast={beasts[0]} score={h.scores[0]} side={0} active={h.spiritActive[0]} align="left" />
        <div className="round">R{h.round}</div>
        <Side name={names[1]} beast={beasts[1]} score={h.scores[1]} side={1} active={h.spiritActive[1]} align="right" />
      </div>
      {h.phase === 'idle' && h.banner === 'vs' && <VsIntro beasts={beasts} arts={arts} names={names} types={types} />}
      {(h.phase === 'grip' || h.phase === 'countdown' || h.phase === 'coach') && (
        <div className={`launch-overlay phase-${h.phase}`} ref={spectator ? undefined : onSwipeZone}>
          {h.phase === 'grip' && (spectator ? <div className="grip-pill">Players rip on LAUNCH</div> : <GripGuide motion={h.inputMode === 'motion'} round={h.round} coach={h.coach} />)}
          {h.phase === 'countdown' && h.countdown && h.countdown !== 'LAUNCH' && <Art key={h.countdown} id={COUNT_ART[h.countdown] ?? ''} text={h.countdown} className="countdown tick" />}
          {h.phase === 'countdown' && h.countdown !== 'LAUNCH' && <div className="launch-hint">{spectator ? 'Players rip on LAUNCH' : h.coach ? 'Get ready…' : h.inputMode === 'motion' ? 'Pull DOWN on LAUNCH' : 'Swipe DOWN on LAUNCH'}</div>}
          {h.phase === 'coach' && <CoachOverlay motion={h.inputMode === 'motion'} />}
          {!spectator && h.inputMode === 'motion' && (h.phase === 'countdown' || h.phase === 'coach') && <PullMeter />}
        </div>
      )}
      {h.guide && guideLive(h.guide, h.phase) && !spectator && <GuideThumb guide={h.guide} countdown={h.countdown} />}
      {h.countdown === 'LAUNCH' && (
        <div className="launch-flash" aria-live="assertive">
          <Art id={COUNT_ART.LAUNCH!} text="LAUNCH!" className="launch-word" />
        </div>
      )}
      {h.callout && <LaunchCallout key={`${h.round}-${h.callout.rpm}-${h.callout.quality}`} callout={h.callout} color={BEASTS[beasts[0]].color} />}
      {h.coachTip && <CoachTipCard tip={h.coachTip} />}
      {h.banner && h.phase !== 'grip' && h.phase !== 'countdown' && h.phase !== 'coach' && !(h.phase === 'idle' && h.banner === 'vs') && <Art key={h.banner} id={BANNER_ART[h.banner]} text={BANNER_TEXT[h.banner]} className={`banner pop ${h.banner}`} />}
      {h.cine && (
        <div className="cine" aria-hidden="true">
          <i className="cine-bar top" />
          <i className="cine-bar bottom" />
          {hasAsset('vfx/speedlines') && <img className="cine-lines" src={assetUrl('vfx/speedlines')} alt="" draggable={false} />}
          <span className="cine-tag">Final blow</span>
        </div>
      )}
      {h.summon !== null && !h.cine && (
        <div className="cine summon" aria-hidden="true">
          <i className="cine-bar top" />
          <i className="cine-bar bottom" />
          {hasAsset('vfx/speedlines') && <img className="cine-lines summon-lines" src={assetUrl('vfx/speedlines')} alt="" draggable={false} />}
          <span className="cine-tag">{h.summon === 'both' ? 'Beast clash!' : 'Beast takeover'}</span>
        </div>
      )}
      {h.phase === 'battle' && (h.edge[0] || h.edge[1]) && !h.cine && h.summon === null && (
        <div className={`edge-tag ${h.edge[0] ? 'mine' : 'rival'}`} role="status">
          <b>EDGE!</b>
          <small>{spectator ? `${names[h.edge[0] ? 0 : 1]} on the edge` : h.edge[0] ? 'Steer in!' : 'Rival on the edge!'}</small>
        </div>
      )}
      {h.saved && h.phase === 'battle' && <div key={h.saved.n} className={`saved-pop ${h.saved.side === 0 ? 'mine' : 'rival'}`} aria-hidden="true">SAVED!</div>}
      {h.notice && <div className="hud-notice" role="status">{h.notice}</div>}
      {h.announcer && (
        <div key={h.announcer.id} className="announcer" aria-live="polite">
          <Art id={`characters/commentator/${h.announcer.face}`} text="" className="announcer-face" />
          <p>{h.announcer.text}</p>
        </div>
      )}
      {h.cutin && <CutIn beast={h.cutin.beast} side={h.cutin.side} hesitate={h.cutin.hesitate} />}
      {stickLive(h.phase, spectator) && <Stick onStick={onStick} />}
      {h.phase === 'battle' && !spectator && (
        <>
          {h.refused > 0 && <div key={h.refused} className="spirit-refused" role="status">Rival's beast is out!</div>}
          <button className={`spirit-btn ${ready ? 'ready' : ''} ${h.refused > 0 ? (h.refused % 2 ? 'refused' : 'refused-b') : ''}`} onPointerDown={onSpirit} disabled={!ready && !blocked}>
            <Live className="gauge" get={st => ({ height: `${Math.min(1, st.gauge[0]) * 100}%` })} />
            <span>{ready ? 'TAP!' : 'SPIRIT'}</span>
          </button>
        </>
      )}
      {!spectator && <LessonOverlay />}
    </div>
  )
}

function Live({ className, get }: { className: string; get: (s: ReturnType<typeof useHud.getState>) => Partial<Record<'height' | 'width' | 'transform' | 'background', string>> }) {
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
      <div className="spinbar" role="meter" aria-label="Stamina"><Live className="" get={st => ({ width: `${Math.max(0, Math.min(1, st.spin[side])) * 100}%` })} /></div>
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
    const key = (e: KeyboardEvent) => (e.key.length === 1 ? e.key.toLowerCase() : e.key)
    const down = (e: KeyboardEvent) => { keys.add(key(e)); apply() }
    const up = (e: KeyboardEvent) => { keys.delete(key(e)); apply() }
    const blur = () => { keys.clear(); apply() }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur) }
  }, [onStick])
  const release = () => { origin.current = null; setKnob(null); onStick(0, 0) }
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
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
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
