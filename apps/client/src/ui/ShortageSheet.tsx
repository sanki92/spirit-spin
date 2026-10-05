import { useEffect, useRef } from 'react'
import { useNav } from '../state/nav'
import { useSave } from '../state/save'
import { useShortage } from '../state/shortage'
import { Img } from './kit'

const WAYS = {
  coins: ['Win Tower battles and clear new floors', 'Battle friends in Live', 'Claim your daily reward and daily quests', 'Collect coins on the Spirit Pass free track'],
  shards: ['Win your first battle each day', 'Finish daily quests', 'Clear Tower floors and level up', 'Get a part you already own'],
}

export function ShortageSheet() {
  const open = useShortage(s => s.open)
  const hide = useShortage(s => s.hide)
  const have = useSave(s => (open?.kind === 'shards' ? s.shards ?? 0 : s.coins))
  const close = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    close.current?.focus()
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') hide() }
    window.addEventListener('keydown', esc)
    return () => { window.removeEventListener('keydown', esc); prev?.focus?.() }
  }, [open, hide])
  if (!open) return null
  const coins = open.kind === 'coins'
  const unit = coins ? 'coins' : 'Spirit Shards'
  const battle = () => {
    hide()
    useNav.getState().push({ k: 'tower' })
  }
  return (
    <div className="sheet-backdrop" onClick={hide}>
      <section className="sheet shortage" role="alertdialog" aria-modal="true" aria-labelledby="shortage-title" onClick={e => e.stopPropagation()}>
        <span className="sheet-grip" aria-hidden="true" />
        <button ref={close} className="sheet-close" onClick={hide} aria-label="Close">✕</button>
        <Img id={coins ? 'ui/icon-coin' : 'ui/icon-spirit-shard'} className="shortage-icon" />
        <h2 id="shortage-title">Not enough {unit}</h2>
        <p className="shortage-need">You need <b>{open.need.toLocaleString('en-IN')}</b> more {unit} for {open.item}.</p>
        <p className="shortage-have">You have {have.toLocaleString('en-IN')}.</p>
        <ul className="shortage-ways">{WAYS[open.kind].map(w => <li key={w}>{w}</li>)}</ul>
        <div className="shortage-acts">
          <button className="cta gold" onClick={battle}><span>Battle in the Tower</span></button>
          <button className="text-btn" onClick={hide}>Not now</button>
        </div>
      </section>
    </div>
  )
}
