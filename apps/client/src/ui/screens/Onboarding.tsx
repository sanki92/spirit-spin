import { assembleTop, STARTER_BEASTS, TECHNIQUES, scoreRip, ROOKIE_BUILDS, type BeastId } from '@spirit/core'
import { useEffect, useRef, useState } from 'react'
import { BEASTS } from '../../game/beasts'
import { useRuntime } from '../../runtime'
import { useNav } from '../../state/nav'
import { useSave } from '../../state/save'
import { Img, Screen, Slash, Stat } from '../kit'
import { GuideStrip } from '../hud/LaunchHud'

export function Splash() {
  const nav = useNav()
  const birthYear = useSave(s => s.birthYear)
  return (
    <div className="screen entry splash2">
      <Img id="key-art/hero-portrait" className="entry-art" eager fallback={<Img id="key-art/style-anchor-v3" className="entry-art" eager />} />
      <button className="entry-hit" onClick={() => nav.replace(birthYear ? { k: 'ready' } : { k: 'age' })} aria-label="Start">
        <Img id="ui/logo" className="entry-logo" eager fallback={<h1 className="wordmark slant">Spirit Spin</h1>} />
        <span className="entry-tag">Six spirits. One rip.</span>
        <span className="entry-start">Tap to start</span>
      </button>
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
