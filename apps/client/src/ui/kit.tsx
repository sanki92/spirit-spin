import type { ReactNode } from 'react'
import { assetUrl, hasAsset } from '../assets/assets'
import { useNav } from '../state/nav'
import { useSave } from '../state/save'

export function Img({ id, alt = '', className, fallback }: { id: string; alt?: string; className?: string; fallback?: ReactNode }) {
  if (!hasAsset(id)) return <>{fallback ?? null}</>
  return <img className={className} src={assetUrl(id)} alt={alt} draggable={false} loading="lazy" decoding="async" />
}

export function Screen({ children, bg, className = '' }: { children: ReactNode; bg?: string; className?: string }) {
  const style = bg && hasAsset(bg) ? { backgroundImage: `linear-gradient(180deg, rgba(7,11,31,0.55), rgba(7,11,31,0.92)), url(${assetUrl(bg)})` } : undefined
  return <div className={`screen page ${className}`} style={style}>{children}</div>
}

export function TopBar({ title, right }: { title: string; right?: ReactNode }) {
  const back = useNav(s => s.back)
  return (
    <header className="topbar">
      <button className="icon-btn" onClick={back} aria-label="Back">‹</button>
      <h1 className="slant">{title}</h1>
      <div className="topbar-right">{right ?? <Coins />}</div>
    </header>
  )
}

export function Coins() {
  const coins = useSave(s => s.coins)
  return (
    <div className="coins">
      <Img id="ui/icon-coin" className="coin-icon" />
      <span>{coins.toLocaleString()}</span>
    </div>
  )
}

export function Slash({ children, onClick, tone = 'cyan', disabled, className = '' }: { children: ReactNode; onClick?: () => void; tone?: 'cyan' | 'gold' | 'ghost'; disabled?: boolean; className?: string }) {
  return (
    <button className={`slash ${tone} ${className}`} onClick={onClick} disabled={disabled}>
      <span>{children}</span>
    </button>
  )
}

export function Bar({ value, max = 1, tone = 'cyan', label }: { value: number; max?: number; tone?: 'cyan' | 'gold' | 'red' | 'violet'; label?: string }) {
  const pct = Math.max(0, Math.min(1, value / max)) * 100
  return (
    <div className="bar-row">
      {label && <span className="bar-label">{label}</span>}
      <div className={`bar ${tone}`}><div style={{ transform: `scaleX(${pct / 100})` }} /></div>
    </div>
  )
}

export function Axis({ left, right, value }: { left: string; right: string; value: number }) {
  const x = ((value + 10) / 20) * 100
  return (
    <div className="axis">
      <span>{left}</span>
      <div className="axis-track"><i style={{ left: `${x}%` }} /></div>
      <span>{right}</span>
    </div>
  )
}

export function Stat({ name, value }: { name: string; value: number }) {
  return (
    <div className="stat">
      <span>{name}</span>
      <div className="pips10">{Array.from({ length: 10 }, (_, i) => <i key={i} className={i < value ? 'on' : ''} />)}</div>
    </div>
  )
}
