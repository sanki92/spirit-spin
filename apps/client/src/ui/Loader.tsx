import { useEffect, useState } from 'react'
import { hasAsset, assetUrl } from '../assets/assets'
import { BEASTS } from '../game/beasts'
import { useSave } from '../state/save'

const TIPS = [
  'A fast, straight pull lands PERFECT rips.',
  'Tap Spirit when the gauge glows.',
  'Tilt to steer. Dodge big hits, then strike from the side.',
  'Upgrade parts with Spirit Shards in the Garage.',
  'Clear Tower bosses to unlock new beasts and parts.',
  'Empowered strikes cut through shields and tides.',
]

function art(id: string): string | null {
  return hasAsset(id) ? assetUrl(id) : null
}

export function Loader({ label = 'Loading', tips = true, full = false }: { label?: string; tips?: boolean; full?: boolean }) {
  const s = useSave.getState()
  const build = s.loadout
  const beast = build?.beastId ?? s.starter ?? 'voltfang'
  const blade = art(`parts/blade-${build?.bladeId ?? 'fang'}`), disc = art(`parts/disc-${build?.discId ?? 'standard'}`), emblem = art(`beasts/${beast}/emblem`)
  const [tip, setTip] = useState(() => Math.floor(Math.random() * TIPS.length))
  useEffect(() => {
    if (!tips) return
    const i = window.setInterval(() => setTip(t => (t + 1) % TIPS.length), 2800)
    return () => clearInterval(i)
  }, [tips])
  if (full) {
    const form = s.beasts[beast]?.awakened
    const hero = art(form ? `beasts/${beast}/awakened-${form}/card-art` : `beasts/${beast}/card-art`) ?? art(`beasts/${beast}/card-art`)
    return (
      <div className="loader full ld2" role="status" aria-live="polite" style={{ ['--c' as string]: BEASTS[beast].color }}>
        {hero && <img className="ld2-art" src={hero} alt="" />}
        <div className="ld2-foot">
          <div className="ld2-head">
            <span className="ld2-top" aria-hidden="true">
              {disc && <img className="loader-disc" src={disc} alt="" />}
              {blade && <img className="loader-blade" src={blade} alt="" />}
              {emblem && <img className="loader-emblem" src={emblem} alt="" />}
            </span>
            <span className="ld2-text"><small>{BEASTS[beast].name}</small><strong>{label}</strong></span>
          </div>
          <span className="ld2-bar" aria-hidden="true"><i /></span>
          {tips && <p key={tip} className="ld2-tip"><b>Tip</b>{TIPS[tip]}</p>}
        </div>
      </div>
    )
  }
  return (
    <div className="loader" role="status" aria-live="polite" style={{ ['--c' as string]: BEASTS[beast].color }}>
      <div className="loader-top" aria-hidden="true">
        <i className="loader-ring" />
        {disc && <img className="loader-disc" src={disc} alt="" />}
        {blade && <img className="loader-blade" src={blade} alt="" />}
        {emblem && <img className="loader-emblem" src={emblem} alt="" />}
      </div>
      <strong className="loader-label">{label}<span className="loader-dots"><i /><i /><i /></span></strong>
      {tips && <p key={tip} className="loader-tip">{TIPS[tip]}</p>}
    </div>
  )
}

export function Skeleton({ kind = 'line', w, h, count = 1 }: { kind?: 'line' | 'tile' | 'card' | 'row' | 'circle'; w?: number | string; h?: number | string; count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className={`skel skel-${kind}`} style={{ width: w, height: h, animationDelay: `${i * 0.08}s` }} aria-hidden="true" />
      ))}
    </>
  )
}

export function SkeletonList({ rows = 3 }: { rows?: number }) {
  return (
    <div className="skel-list" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skel-item" style={{ animationDelay: `${i * 0.1}s` }}>
          <Skeleton kind="circle" />
          <span className="skel-lines"><Skeleton kind="line" w="62%" /><Skeleton kind="line" w="38%" /></span>
        </div>
      ))}
    </div>
  )
}
