import { Vector3, type Camera } from 'three'

export interface GuardScene { fighting: boolean; cine: boolean; zoom: boolean; summon: boolean; outcome: boolean; out: boolean; broken: boolean }

export const guardVisible = (o: GuardScene): boolean => o.fighting && !o.cine && !o.zoom && !o.summon && !o.outcome && !o.out && !o.broken

export function toScreen(nx: number, ny: number, w: number, h: number, o: { x: number; y: number }): { x: number; y: number } {
  o.x = (nx + 1) * 0.5 * w
  o.y = (1 - ny) * 0.5 * h
  return o
}

export function guardLook(v: number): { pct: number; low: boolean } {
  const c = v < 0 ? 0 : v > 1 ? 1 : v
  return { pct: Math.round(c * 100), low: c < 0.3 }
}

const W = 44
const H = 6
const ABOVE = 0.3

export class GuardBars {
  private readonly bars: HTMLDivElement[] = []
  private readonly fills: HTMLDivElement[] = []
  private readonly pct = [-1, -1]
  private readonly low = [false, false]
  private readonly shown = [false, false]
  private readonly v = new Vector3()
  private readonly px = { x: 0, y: 0 }

  constructor(private readonly host: HTMLElement) {
    for (let i = 0; i < 2; i++) {
      const bar = document.createElement('div')
      bar.className = `guard-float ${i === 0 ? 'me' : 'rival'}`
      bar.setAttribute('role', 'meter')
      bar.setAttribute('aria-label', i === 0 ? 'Your guard' : 'Rival guard')
      bar.style.display = 'none'
      const fill = document.createElement('div')
      fill.className = 'guard-fill'
      bar.appendChild(fill)
      host.appendChild(bar)
      this.bars.push(bar)
      this.fills.push(fill)
    }
  }

  update(i: 0 | 1, x: number, y: number, z: number, guard: number, show: boolean, camera: Camera, w: number, h: number): void {
    const bar = this.bars[i]!
    if (!show || w <= 0 || h <= 0) return this.hideOne(i)
    this.v.set(x, y + ABOVE, z).project(camera)
    if (this.v.z > 1) return this.hideOne(i)
    toScreen(this.v.x, this.v.y, w, h, this.px)
    bar.style.transform = `translate3d(${(this.px.x - W / 2).toFixed(1)}px, ${(this.px.y - H / 2).toFixed(1)}px, 0)`
    if (!this.shown[i]) { bar.style.display = ''; this.shown[i] = true }
    const look = guardLook(guard)
    if (look.pct !== this.pct[i]) { this.pct[i] = look.pct; this.fills[i]!.style.transform = `scaleX(${look.pct / 100})` }
    if (look.low !== this.low[i]) { this.low[i] = look.low; bar.classList.toggle('low', look.low) }
  }

  hide(): void {
    this.hideOne(0)
    this.hideOne(1)
  }

  private hideOne(i: 0 | 1): void {
    if (!this.shown[i]) return
    this.bars[i]!.style.display = 'none'
    this.shown[i] = false
  }

  dispose(): void {
    for (const b of this.bars) b.remove()
    this.bars.length = 0
    this.fills.length = 0
  }
}
