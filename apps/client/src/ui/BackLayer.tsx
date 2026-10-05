import { useEffect, useRef } from 'react'
import { leaveBattle, useBack } from '../state/back'
import { useNav } from '../state/nav'

export function BackLayer() {
  const confirm = useBack(s => s.confirmLeave)
  const exitHint = useBack(s => s.exitHint)
  const live = useNav(s => s.stack.at(-1)?.k === 'live')
  const stay = useRef<HTMLButtonElement>(null)
  const keep = () => useBack.setState({ confirmLeave: false })
  useEffect(() => {
    if (!confirm) return
    stay.current?.focus()
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') keep() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [confirm])
  return (
    <>
      {confirm && (
        <div className="sheet-backdrop" onClick={keep}>
          <section className="sheet leave-battle" role="alertdialog" aria-modal="true" aria-labelledby="leave-title" onClick={e => e.stopPropagation()}>
            <span className="sheet-grip" aria-hidden="true" />
            <h2 id="leave-title">Leave the battle?</h2>
            <p>{live ? 'You forfeit this match and your rival wins.' : 'This battle won’t count. You can try again anytime.'}</p>
            <div className="shortage-acts">
              <button ref={stay} className="cta cyan" onClick={keep}><span>Keep battling</span></button>
              <button className="text-btn" onClick={leaveBattle}>{live ? 'Forfeit and leave' : 'Leave battle'}</button>
            </div>
          </section>
        </div>
      )}
      {exitHint && <p className="toast exit-hint" role="status">Go back again to exit</p>}
    </>
  )
}
