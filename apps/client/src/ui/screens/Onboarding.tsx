import { assembleTop, STARTER_BEASTS, TECHNIQUES, scoreRip, ROOKIE_BUILDS, type BeastId } from '@spirit/core'
import { useEffect, useRef, useState } from 'react'
import { BEASTS } from '../../game/beasts'
import { useRuntime } from '../../runtime'
import { useNav } from '../../state/nav'
import { useSave } from '../../state/save'
import { Img, Screen, Slash, Stat } from '../kit'
import { GuideStrip } from '../hud/LaunchHud'

const INTRO_MS = 2600

function IntroTop({ side, blade, disc, beast }: { side: 'l' | 'r'; blade: string; disc: string; beast: BeastId }) {
  return (
    <span className={`intro-top ${side}`} style={{ ['--c' as string]: BEASTS[beast].color }}>
      <span className="intro-spin">
        <Img id={`parts/disc-${disc}`} eager />
        <Img id={`parts/blade-${blade}`} eager />
        <Img id={`beasts/${beast}/emblem-disc`} className="intro-emblem" eager />
      </span>
    </span>
  )
}

export function Splash() {
  const nav = useNav()
  const birthYear = useSave(s => s.birthYear)
  const calm = useSave(s => s.settings.reducedMotion) || !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const stage = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState<'wait' | 'go' | 'end'>('wait')
  const start = () => nav.replace(birthYear ? { k: 'ready' } : { k: 'age' })
  useEffect(() => {
    let live = true, t = 0
    const imgs = [...(stage.current?.querySelectorAll('img') ?? [])]
    const ready = Promise.all(imgs.map(i => i.decode().catch(() => undefined)))
    void Promise.race([ready, new Promise(r => setTimeout(r, 1500))]).then(() => {
      if (!live) return
      setPhase(p => (p === 'wait' ? 'go' : p))
      t = window.setTimeout(() => setPhase('end'), calm ? 900 : INTRO_MS)
    })
    return () => { live = false; clearTimeout(t) }
  }, [calm])
  return (
    <div className={`screen intro i-${phase} ${calm ? 'calm' : ''}`} onClick={() => (phase === 'end' ? start() : setPhase('end'))}>
      <div ref={stage} className="intro-stage" aria-hidden="true">
        <Img id="key-art/hero-portrait" className="intro-art" eager fallback={<Img id="key-art/style-anchor-v3" className="intro-art" eager />} />
        <i className="intro-dim" />
        {!calm && <IntroTop side="l" blade="spark" disc="compact" beast="voltfang" />}
        {!calm && <IntroTop side="r" blade="ember" disc="heavy" beast="agnyx" />}
        {!calm && <Img id="vfx/hit-lightning" className="intro-spark l" eager />}
        {!calm && <Img id="vfx/hit-fire" className="intro-spark r" eager />}
        {!calm && <Img id="vfx/shockwave" className="intro-ring" eager />}
        {!calm && <Img id="vfx/impact-flash" className="intro-flash" eager />}
        <Img id="ui/logo" className="intro-logo" eager fallback={<strong className="intro-word">Spirit Spin</strong>} />
      </div>
      <h1 className="sr-only">Spirit Spin</h1>
      {phase !== 'end' && <button className="sr-only" onClick={e => { e.stopPropagation(); setPhase('end') }}>Skip intro</button>}
      {phase === 'end' && (
        <button className="cta gold intro-start" onClick={e => { e.stopPropagation(); start() }} aria-label="Start"><span>Tap to start</span></button>
      )}
    </div>
  )
}

export function AgeGate() {
  const nav = useNav()
  const setBirthYear = useSave(s => s.setBirthYear)
  const now = new Date().getFullYear()
  const [year, setYear] = useState(now - 16)
  const [blocked, setBlocked] = useState(false)
  if (blocked) {
    return (
      <Screen className="center">
        <h2 className="slant">Come back soon</h2>
        <p className="body">Spirit Spin is for players 13 and older.</p>
      </Screen>
    )
  }
  return (
    <Screen bg="backgrounds/main-menu" className="center">
      <h2 className="slant">When were you born?</h2>
      <select className="year" value={year} onChange={e => setYear(Number(e.target.value))} aria-label="Birth year">
        {Array.from({ length: 90 }, (_, i) => now - i).map(y => <option key={y} value={y}>{y}</option>)}
      </select>
      <Slash onClick={() => (now - year < 13 ? setBlocked(true) : (setBirthYear(year), nav.replace({ k: 'ready' })))}>Continue</Slash>
      <p className="fine">We only keep the year, never your full birthday.</p>
    </Screen>
  )
}

export function StarterSelect() {
  const nav = useNav()
  const choose = useSave(s => s.chooseStarter)
  const [pick, setPick] = useState<BeastId>('voltfang')
  const spec = assembleTop(ROOKIE_BUILDS[pick])
  const info = BEASTS[pick]
  return (
    <Screen className="starter" bg="backgrounds/main-menu">
      <h2 className="slant">Choose your partner</h2>
      <div className="starter-art" style={{ ['--c' as string]: info.color }}>
        <Img key={pick} id={`beasts/${pick}/card-art`} className="card-art pop" />
        <div className="starter-name">
          <span>{info.title} · {spec.type}</span>
          <strong className="slant">{info.name}</strong>
          <em><b>{TECHNIQUES[pick].technique.name}</b> {TECHNIQUES[pick].technique.text}</em>
        </div>
      </div>
      <div className="starter-stats">
        <Stat name="Attack" value={spec.stats.attack} />
        <Stat name="Defense" value={spec.stats.defense} />
        <Stat name="Stamina" value={spec.stats.stamina} />
        <Stat name="Speed" value={spec.stats.speed} />
      </div>
      <div className="starter-picks" role="radiogroup">
        {STARTER_BEASTS.map(id => (
          <button key={id} role="radio" aria-checked={id === pick} className={`emblem-pick ${id === pick ? 'on' : ''}`} onClick={() => setPick(id)} style={{ ['--c' as string]: BEASTS[id].color }}>
            <Img id={`beasts/${id}/emblem`} alt="" eager />
            <span>{BEASTS[id].name}</span>
          </button>
        ))}
      </div>
      <Slash tone="gold" onClick={() => { choose(pick); nav.replace({ k: 'safety' }) }}>Partner with {info.name}</Slash>
      <p className="fine">Every partner starts as a rookie. Win Tower floors, earn parts and upgrade to grow stronger. You'll meet the other three in the Spirit Tower.</p>
    </Screen>
  )
}

export function Safety() {
  const nav = useNav()
  const mark = useSave(s => s.markOnboarded)
  return (
    <Screen className="center safety">
      <h2 className="slant">How to rip</h2>
      <div className="safety-art">
        <Img id="onboarding/safety-grip" className="grip-art" />
        <Img id="onboarding/no-throw" className="nothrow-art" />
      </div>
      <ol className="rules panel">
        <li><b>Grip</b> Hold your phone with both hands, screen facing you.</li>
        <li><b>Rip</b> On LAUNCH, pull it sharply down toward you, then stop.</li>
        <li><b>Safe</b> Never let go and never throw. Timing beats strength.</li>
      </ol>
      <Slash onClick={() => { mark('safety'); nav.reset({ k: 'home' }) }}>Got it</Slash>
    </Screen>
  )
}

export function Calibrate() {
  const nav = useNav()
  const rt = useRuntime()
  const mark = useSave(s => s.markOnboarded)
  const [step, setStep] = useState(0)
  const [beat, setBeat] = useState<string | null>(null)
  const pulls = useRef<number[]>([])
  useEffect(() => {
    if (step >= 3 || !rt.sensors) return
    const t0 = performance.now() + 2200
    const timers = [
      setTimeout(() => setBeat('Ready'), 200),
      setTimeout(() => setBeat('Set'), 1200),
      setTimeout(() => { setBeat('RIP!'); rt.sound.play('launch') }, t0 - performance.now()),
      setTimeout(() => {
        const r = scoreRip(rt.sensors!.window(t0 - 1100, t0 + 700), t0, { pull100: 1 })
        if (r.ok) pulls.current.push(r.pullRatio)
        setBeat(r.ok ? 'Nice!' : 'Try again')
        setTimeout(() => setStep(s => (r.ok ? s + 1 : s)), 700)
      }, t0 + 750 - performance.now()),
    ]
    return () => timers.forEach(clearTimeout)
  }, [step, rt])
  useEffect(() => {
    if (step === 3) {
      rt.saveCalibration(pulls.current)
      mark('calibrated')
    }
  }, [step, rt, mark])
  return (
    <Screen className="center calibrate">
      <h2 className="slant">Tune your launcher</h2>
      <GuideStrip size="big" active={beat === 'RIP!' ? 2 : beat === 'Set' ? 1 : 0} />
      {step < 3 ? (
        <>
          <p className="body">Rip {3 - step} more {3 - step === 1 ? 'time' : 'times'} at your normal strength.</p>
          <div className={`beat ${beat === 'RIP!' ? 'hot' : ''}`}>{beat}</div>
        </>
      ) : (
        <>
          <p className="body">Done. Your launcher is tuned to you. Full power comes from a clean pull, not a hard one.</p>
          <Slash tone="gold" onClick={() => nav.back()}>Done</Slash>
        </>
      )}
      {step < 3 && <button className="text-btn" onClick={() => nav.back()}>Cancel</button>}
    </Screen>
  )
}
