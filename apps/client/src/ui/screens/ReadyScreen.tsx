import { useEffect, useRef, useState } from 'react'
import { assetUrl, hasAsset } from '../../assets/assets'
import { useRuntime } from '../../runtime'

export function ReadyScreen({ onReady }: { onReady: (r: { motion: boolean }) => void }) {
  const rt = useRuntime()
  const [busy, setBusy] = useState(false)
  const arm = async (mic = true) => {
    setBusy(true)
    onReady(await rt.arm(mic))
  }
  const auto = useRef(false)
  useEffect(() => {
    if (!import.meta.env.DEV || auto.current || !new URLSearchParams(location.search).has('screen')) return
    auto.current = true
    void arm(false)
  }, [])
  return (
    <div className="screen ready-screen" style={hasAsset('backgrounds/main-menu') ? { backgroundImage: `url(${assetUrl('backgrounds/main-menu')})` } : undefined}>
      {hasAsset('ui/logo') && <img className="logo" src={assetUrl('ui/logo')} alt="Spirit Spin" />}
      <div className="ready-body">
        {hasAsset('onboarding/tap-ready') && <img className="ready-art" src={assetUrl('onboarding/tap-ready')} alt="" />}
        <button className="btn-primary big" onClick={() => void arm()} disabled={busy}>
          {busy ? 'ARMING…' : 'TAP TO READY'}
        </button>
        <p className="fine">Turns on motion launch, sound and the Spirit Call mic. Nothing is recorded.</p>
      </div>
    </div>
  )
}
