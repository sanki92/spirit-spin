import { useEffect, useRef, useState } from 'react'
import { Img } from '../kit'
import { useRuntime } from '../../runtime'
import { motionOn } from '../../input/motionSetting'
import { useSave } from '../../state/save'

export function ReadyScreen({ onReady }: { onReady: (r: { motion: boolean }) => void }) {
  const rt = useRuntime()
  const motion = useSave(st => motionOn(st.settings))
  const [busy, setBusy] = useState(false)
  const arm = async () => {
    setBusy(true)
    onReady(await rt.arm(motion))
  }
  const auto = useRef(false)
  useEffect(() => {
    if (!import.meta.env.DEV || auto.current || !new URLSearchParams(location.search).has('screen')) return
    auto.current = true
    void arm()
  }, [])
  return (
    <div className="screen entry ready2">
      <Img id="key-art/hero-portrait" className="entry-art dim" eager />
      <div className="ready2-body">
        <Img id="ui/logo" className="entry-logo small" eager />
        <section className="ready2-panel">
          <h1>Get ready to rip</h1>
          <ul>
            <li><Img id={motion ? 'ui/icons/motion' : 'ui/guide/thumb'} eager /><span><strong>{motion ? 'Motion launch' : 'Swipe launch'}</strong><small>{motion ? 'Rip your phone to launch your top.' : 'Flick your thumb down to rip.'}</small></span></li>
            <li><Img id="ui/icons/sound" eager /><span><strong>Sound</strong><small>Hear every clash and the commentator.</small></span></li>
          </ul>
          <button className="cta cyan" onClick={() => void arm()} disabled={busy}><span>{busy ? 'Arming…' : 'Tap to ready'}</span></button>
          <p className="ready2-fine">{motion ? 'You can switch to swipe launch anytime in Settings.' : 'Prefer ripping your phone? Turn on Motion controls in Settings.'}</p>
        </section>
      </div>
    </div>
  )
}
